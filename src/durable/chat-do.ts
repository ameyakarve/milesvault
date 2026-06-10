import type { ChatResponseResult } from '@cloudflare/think'
import { generateText, stepCountIs, tool, type ToolCallRepairFunction, type ToolSet } from 'ai'
import { draftTransactionBatchSchema } from './agent-ui-schemas'
import { repairDraftBatch } from '@/lib/beancount/repair-draft-batch'
import { buildLedgerSystem, buildStatementAgentSystem } from './agent-prompt'
import type { LedgerDO } from './ledger-do'
import { BaseAgentDO } from './base-agent-do'
import {
  makeEditorRegistry,
  STATEMENT_MODEL_ID,
  type EditorAgentName,
} from './agents/registries/editor'
import {
  cardGuideTool,
  draftTransactionTool,
  clarifyTool,
  readStatementTool,
} from './agents/tools/editor'
import { makeKbTools, kbHttpOverFetch } from './agents/tools/concierge/kb-tools'
import type { AgentHost, Registry } from './agents/types'

// The chat/agent runtime for the `/editor` surface. Hosts the `ledger ↔
// statement` agents and the genUI tools they call. Pure compute: all ledger
// reads (snapshot, statement blobs) go to the LedgerDO storage object over
// RPC, keyed by the same per-user name; writes (approved drafts) flow back
// through the browser REST path, never directly from here.
type Snapshot = Awaited<ReturnType<LedgerDO['ledger_snapshot']>>

// No broadcast state: the file chip is driven entirely by local upload state in
// the client now that extraction is inline (no async worker phase to mirror).
export type ChatDOState = Record<string, never>

// Tool-call repair hook. Forwarded to streamText as `experimental_repairToolCall`
// via TurnConfig.repairToolCall — see patches/@cloudflare__think@0.7.1.patch.
//
// TODO(upstream-repair): drop this whole indirection (and the patch file) when
// `@cloudflare/think` exposes `repairToolCall` on TurnConfig upstream. The
// rename target is whatever name they pick (current candidate: `repairToolCall`
// to mirror the streamText `experimental_repairToolCall` option without the
// experimental_ prefix). Track via the PR we file at
// github.com/cloudflare/agents. When upstream lands:
//   1. `pnpm patch-remove @cloudflare/think@<old>` (or delete patches/ entry)
//   2. bump @cloudflare/think to the version that ships the field
//   3. if upstream renamed the option, rename here at the single call site
//
// Today the repair handles the forex-rounding class only (LLMs round off by
// ₹0.01 on `@@`-priced INR statements and can't fix it on retry — see
// src/lib/beancount/repair-draft-batch.ts). Genuinely-bad batches fall through
// to the SDK's tool-error path (and the existing spiral bound by maxSteps).
const draftTransactionRepair: ToolCallRepairFunction<ToolSet> = async ({
  toolCall,
}) => {
  if (toolCall.toolName !== 'draft_transaction') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(toolCall.input)
  } catch {
    return null
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { transactions?: unknown }).transactions)
  ) {
    return null
  }
  const transactions = (parsed as { transactions: unknown[] }).transactions
  if (!transactions.every((t): t is string => typeof t === 'string')) return null
  const repaired = repairDraftBatch(transactions)
  if (!repaired.changed) return null
  return {
    ...toolCall,
    input: JSON.stringify({ transactions: repaired.transactions }),
  }
}

function todayInt(): number {
  const now = new Date()
  const yyyy = now.getUTCFullYear().toString().padStart(4, '0')
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0')
  const dd = now.getUTCDate().toString().padStart(2, '0')
  return Number(`${yyyy}${mm}${dd}`)
}

export class ChatDO
  extends BaseAgentDO<Cloudflare.Env, ChatDOState>
  implements AgentHost<EditorAgentName>
{
  protected registry: Registry
  initialState: ChatDOState = {}

  // The ledger snapshot for the current turn, fetched once in beforeTurnFetch
  // (async RPC) and reused by the sync system-prompt builders + every step.
  private turnSnapshot: Snapshot | null = null

  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env)
    this.registry = makeEditorRegistry(this)
  }

  // Headless dry run for the rules playground (experience.md §9): run the
  // statement agent's brain over a pasted email with a rule's prompt, record
  // what draft_transaction WOULD propose, commit nothing. Same system prompt
  // and model as the live agent; the recording tool replaces the suspending
  // client tool so the loop completes without a user.
  async previewDrafts(opts: {
    text: string
    instruction?: string | null
  }): Promise<{ entries: string[]; note: string }> {
    const snapshot = await this.ledgerStub().ledger_snapshot()
    const recorded: string[] = []
    const draft_transaction = tool({
      description:
        'Propose one or more beancount transactions (dry run — they are recorded for preview, not committed).',
      inputSchema: draftTransactionBatchSchema,
      execute: async ({ transactions }) => {
        recorded.push(...transactions)
        return { ok: true, recorded: transactions.length }
      },
    })
    const result = await generateText({
      model: this.buildModel({ id: STATEMENT_MODEL_ID, reasoning: 'off' }),
      system: buildStatementAgentSystem(snapshot),
      prompt: `${opts.instruction?.trim() || 'Extract the transaction(s) from this forwarded email and draft journal entries.'}

--- forwarded email ---
${opts.text}`,
      tools: { draft_transaction },
      stopWhen: stepCountIs(4),
    })
    return { entries: recorded, note: result.text.trim() }
  }

  private ledgerStub(): DurableObjectStub<LedgerDO> {
    const ns = this.env.LEDGER_DO as unknown as DurableObjectNamespace<LedgerDO>
    return ns.get(ns.idFromName(this.name))
  }

  private snapshot(): Snapshot {
    return (
      this.turnSnapshot ?? {
        today: todayInt(),
        accounts: [],
        row_counts: {},
        sample_txns: '',
        schema_ddl: '',
      }
    )
  }

  // Pull the live ledger snapshot for this turn over RPC (the sync system-
  // prompt builders can't `await`).
  protected override async beforeTurnFetch(): Promise<void> {
    this.turnSnapshot = await this.ledgerStub().ledger_snapshot()
  }

  protected override getRepairToolCall():
    | ToolCallRepairFunction<ToolSet>
    | undefined {
    return draftTransactionRepair
  }

  // ---- AgentHost<EditorAgentName> ----

  system(name: EditorAgentName): string {
    if (name === 'ledger') {
      return buildLedgerSystem(this.snapshot()) + this.handoffContextBlock()
    }
    return (
      buildStatementAgentSystem(this.snapshot()) + this.handoffContextBlock()
    )
  }

  tools(name: EditorAgentName): ToolSet {
    // Read-only KG lookup so the editor can resolve the canonical Beancount
    // account segments (bank/cc/currency `beancountName`) for what it writes.
    const kbHttp = kbHttpOverFetch('https://kb', this.env.KB)
    const kb = makeKbTools(kbHttp)
    const kbLookup = { kb_resolve: kb.kb_resolve, kb_get: kb.kb_get }
    // The card drafting guide (earn rules + worked examples) — both agents
    // draft card transactions, so both get it.
    const card_guide = cardGuideTool(kbHttp)
    if (name === 'ledger') {
      return {
        ...kbLookup,
        card_guide,
        draft_transaction: draftTransactionTool(),
        clarify: clarifyTool(),
      }
    }
    return {
      ...kbLookup,
      card_guide,
      draft_transaction: draftTransactionTool(),
      clarify: clarifyTool(),
      read_statement: readStatementTool(async (id) => {
        const stub = this.ledgerStub()
        const blob = await stub.get_statement(id)
        // The agent reading the statement is the extraction step starting —
        // advance the Inbox capture state (best-effort; reads must not fail).
        if (blob) await stub.set_capture_state(id, 'extracted').catch(() => {})
        return blob
      }),
    }
  }

  // ---- History hygiene: redact heavy statement-text outputs ----

  override async onChatResponse(result: ChatResponseResult): Promise<void> {
    await super.onChatResponse(result)

    // Redact the raw statement text that read_statement injected into history.
    // The model has used it this turn; leaving the full blob (often tens of KB)
    // re-pays its token cost on every subsequent turn. The blob still lives in LedgerDO storage, so the model
    // can simply call read_statement again if it genuinely needs it.
    const messages = await this.syncMessagesFromStorage()
    for (const msg of messages) {
      const msgParts = Array.isArray(msg.parts) ? msg.parts : []
      let mutated = false
      const nextParts = msgParts.map((p) => {
        if (
          typeof p !== 'object' ||
          p === null ||
          (p as { type?: unknown }).type !== 'tool-read_statement'
        ) {
          return p
        }
        const part = p as { output?: { ok?: boolean; text?: unknown } }
        const out = part.output
        if (
          !out ||
          typeof out.text !== 'string' ||
          out.text.startsWith('[statement text')
        ) {
          return p
        }
        mutated = true
        return {
          ...p,
          output: {
            ...out,
            text: '[statement text omitted from history — call read_statement again if you need it]',
          },
        }
      })
      if (mutated) {
        await this.updateMessageInHistory({
          ...msg,
          parts: nextParts as typeof msg.parts,
        })
      }
    }
  }
}
