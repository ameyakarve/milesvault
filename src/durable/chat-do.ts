import {
  Think,
  type ChatResponseResult,
  type ThinkSubmissionInspection,
  type TurnConfig,
  type StepConfig,
} from '@cloudflare/think'
import { createWorkersAI } from 'workers-ai-provider'
import {
  type LanguageModel,
  type ToolCallRepairFunction,
  type ToolSet,
} from 'ai'
import { repairDraftBatch } from '@/lib/beancount/repair-draft-batch'
import { buildLedgerSystem, buildStatementAgentSystem } from './agent-prompt'
import type { LedgerDO } from './ledger-do'
import { makeEditorRegistry, type EditorHost } from './agents/registries/editor'
import {
  activeToolNames,
  allAgentNames,
  HANDOFF_TOOL_NAME,
  resolveActiveAgent,
  unionTools,
} from './agents/runtime'
import { makeHandoffTool, type HandoffResult } from './agents/handoff'
import { draftTransactionTool, clarifyTool, readStatementTool } from './agents/tools'
import type { AgentDef, AgentState, ModelConfig, Registry } from './agents/types'

// The chat/agent runtime. Holds conversation history + the agent registry and
// drives the editor agents (ledger ↔ statement). It is pure compute: all
// ledger reads (snapshot, statement blobs) go to the LedgerDO storage object
// over RPC, keyed by the same per-user name; writes (approved drafts) flow back
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
// Nothing else in our codebase touches the patched fields.
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

export class ChatDO extends Think<Cloudflare.Env, ChatDOState> implements EditorHost {
  private registry: Registry
  initialState: ChatDOState = {}

  // The ledger snapshot for the current turn, fetched once in beforeTurn (async
  // RPC) and reused by the sync system-prompt builders + every beforeStep.
  private turnSnapshot: Snapshot | null = null

  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env)
    this.registry = makeEditorRegistry(this)
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

  // ---- Active agent resolution ----

  private activeAgent(): AgentDef {
    return resolveActiveAgent(this.registry, this.getConfig<AgentState>())
  }

  private activeAgentConfig(): {
    system: string
    model: LanguageModel
    activeTools: string[]
    repairToolCall: ToolCallRepairFunction<ToolSet>
  } {
    const agent = this.activeAgent()
    return {
      system: agent.system(),
      model: this.buildModel(agent.model),
      activeTools: activeToolNames(agent),
      repairToolCall: draftTransactionRepair,
    }
  }

  // Build the Workers AI model for an agent's declared config. Reasoning 'off'
  // needs a chat-template flag, not reasoning_effort:null (a no-op — the model
  // keeps streaming a thinking trace). The flag NAME is model-specific (verified
  // by probe): kimi-k2.6 honors `thinking: false`, gemma-4 honors
  // `enable_thinking: false` — the two are not interchangeable. The provider
  // only types enable_thinking/clear_thinking, so cast.
  private buildModel(cfg: ModelConfig): LanguageModel {
    const workersai = createWorkersAI({ binding: this.env.AI })
    if (cfg.reasoning === 'off') {
      const kwargs = cfg.id.includes('gemma')
        ? { enable_thinking: false }
        : { thinking: false }
      return workersai(cfg.id, {
        chat_template_kwargs: kwargs as { enable_thinking?: boolean },
      })
    }
    return workersai(cfg.id, { reasoning_effort: cfg.reasoning })
  }

  // ---- Think per-turn config (delegates to the active agent) ----

  getModel(): LanguageModel {
    return this.buildModel(this.activeAgent().model)
  }

  getSystemPrompt(): string {
    return this.activeAgent().system()
  }

  getTools(): ToolSet {
    return {
      ...unionTools(this.registry),
      [HANDOFF_TOOL_NAME]: this.handoffTool(),
    }
  }

  // beforeTurn is awaited by the framework, so we fetch the live ledger
  // snapshot over RPC here (getSystemPrompt is sync and can't) and pin the
  // active agent's config for the turn.
  override async beforeTurn(): Promise<TurnConfig> {
    this.turnSnapshot = await this.ledgerStub().ledger_snapshot()
    return this.activeAgentConfig()
  }

  override beforeStep(): StepConfig {
    // Re-resolve each step so a mid-turn handoff takes effect immediately. Reuse
    // the snapshot fetched in beforeTurn — it doesn't change within a turn.
    return this.activeAgentConfig()
  }

  // ---- Handoff ----

  private handoffTool() {
    return makeHandoffTool(allAgentNames(this.registry), (to, context) =>
      this.doHandoff(to, context),
    )
  }

  private doHandoff(to: string, context: string): HandoffResult {
    const current = this.activeAgent()
    if (!current.canHandoffTo.includes(to) || !this.registry.agents[to]) {
      return {
        ok: false,
        error: 'invalid_target',
        allowed: [...current.canHandoffTo],
      }
    }
    this.configure<AgentState>({ activeAgent: to, handoffContext: context })
    return { ok: true, handed_off_to: to }
  }

  // Reset conversational ownership back to the registry's entry agent. Called
  // when the user clears the conversation so the next statement upload starts
  // from `ledger` and produces a fresh, visible handoff (activeAgent persists
  // across a chat clear otherwise — clearing only wipes messages).
  async reset_active_agent(): Promise<{ ok: true }> {
    await this.__unsafe_ensureInitialized()
    this.configure<AgentState>({ activeAgent: this.registry.entry })
    return { ok: true }
  }

  private handoffContextBlock(): string {
    const ctx = this.getConfig<AgentState>()?.handoffContext
    return ctx ? `\n\n---\n\n# Context from the previous agent\n\n${ctx}` : ''
  }

  // ---- EditorHost: the `ledger` agent (freeform editor) ----

  ledgerSystem(): string {
    return buildLedgerSystem(this.snapshot()) + this.handoffContextBlock()
  }

  ledgerTools(): ToolSet {
    return {
      draft_transaction: draftTransactionTool(),
      clarify: clarifyTool(),
    }
  }

  // ---- EditorHost: the `statement` specialist agent ----

  statementSystem(): string {
    return buildStatementAgentSystem(this.snapshot()) + this.handoffContextBlock()
  }

  statementTools(): ToolSet {
    return {
      draft_transaction: draftTransactionTool(),
      clarify: clarifyTool(),
      read_statement: readStatementTool((id) => this.ledgerStub().get_statement(id)),
    }
  }

  // ---- Observability + history hygiene ----

  onSubmissionStatus(s: ThinkSubmissionInspection): void {
    console.log(
      `[chat] submission ${s.submissionId} status=${s.status}` +
        (s.error ? ` error=${s.error}` : ''),
    )
  }

  async onChatResponse(result: ChatResponseResult): Promise<void> {
    const parts = Array.isArray(result.message.parts) ? result.message.parts : []
    const toolTypes = parts
      .map((p) => {
        if (typeof p !== 'object' || p === null || !('type' in p)) return ''
        const t = String((p as { type: unknown }).type)
        if (t.startsWith('tool-')) return t
        if (t === 'dynamic-tool') {
          const name = (p as { toolName?: unknown }).toolName
          return typeof name === 'string' ? `dynamic-tool:${name}` : 'dynamic-tool'
        }
        return ''
      })
      .filter((t) => t.length > 0)
    console.log(
      `[chat] onChatResponse role=${result.message.role} parts=${parts.length} tools=[${toolTypes.join(',')}]`,
    )

    // Redact the raw statement text that read_statement injected into history.
    // The model has used it this turn; leaving the full blob (often tens of KB)
    // re-pays its token cost on every subsequent turn (Kimi's reasoning trace
    // amplifies that). The blob still lives in LedgerDO storage, so the model
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
        if (!out || typeof out.text !== 'string' || out.text.startsWith('[statement text')) {
          return p
        }
        mutated = true
        return {
          ...p,
          output: { ...out, text: '[statement text omitted from history — call read_statement again if you need it]' },
        }
      })
      if (mutated) {
        await this.updateMessageInHistory({ ...msg, parts: nextParts as typeof msg.parts })
      }
    }
  }
}
