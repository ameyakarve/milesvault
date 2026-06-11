import type { ChatResponseResult } from '@cloudflare/think'
import { generateText, streamText, stepCountIs, tool, type ToolCallRepairFunction, type ToolSet } from 'ai'
import { draftTransactionBatchSchema } from './agent-ui-schemas'
import { repairDraftBatch } from '@/lib/beancount/repair-draft-batch'
import { buildLedgerSystem, buildStatementAgentSystem, buildStatementIrSystem } from './agent-prompt'
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
  addCardTool,
  readStatementTool,
} from './agents/tools/editor'
import { makeKbTools, kbHttpOverFetch } from './agents/tools/concierge/kb-tools'
import { runDraftPipeline } from './ingest/pipeline'
import type { AgentHost, Registry } from './agents/types'

// The chat/agent runtime for the `/editor` surface. Hosts the `ledger ↔
// statement` agents and the genUI tools they call. Pure compute: all ledger
// reads (snapshot, statement blobs) go to the LedgerDO storage object over
// RPC, keyed by the same per-user name; writes (approved drafts) flow back
// through the browser REST path, never directly from here.
type Snapshot = Awaited<ReturnType<LedgerDO['ledger_snapshot']>>

// No broadcast state: the file chip is driven entirely by local upload state in
// the client now that extraction is inline (no async worker phase to mirror).
// Live draft trace (Think state-sync primitive): the per-capture DO
// publishes the streamed extraction tail here; the Inbox reads it via
// useAgent when a still-drafting item is selected.
export type ChatDOState = { draftProgress?: string }

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
    // Structured tool-invocation log — the observability loop for tuning the
    // editor agents. Server-tool executions land here (client tools like
    // draft_transaction live in message history); /api/debug/tool-log reads it.
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS tool_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      agent TEXT NOT NULL,
      tool TEXT NOT NULL,
      input TEXT,
      output TEXT,
      ok INTEGER NOT NULL,
      error TEXT,
      ms INTEGER NOT NULL
    )`)
  }

  private logTool(entry: {
    agent: string
    tool: string
    input: unknown
    output: unknown
    ok: boolean
    error?: string | null
    ms: number
  }): void {
    const trim = (v: unknown): string | null => {
      if (v === undefined) return null
      try {
        const s = JSON.stringify(v)
        return s.length > 16000 ? s.slice(0, 16000) + '…' : s
      } catch {
        return String(v).slice(0, 4000)
      }
    }
    try {
      this.ctx.storage.sql.exec(
        `INSERT INTO tool_log (ts, agent, tool, input, output, ok, error, ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        Date.now(),
        entry.agent,
        entry.tool,
        trim(entry.input),
        trim(entry.output),
        entry.ok ? 1 : 0,
        entry.error ?? null,
        entry.ms,
      )
      // Keep the log bounded.
      this.ctx.storage.sql.exec(
        `DELETE FROM tool_log WHERE id <= (SELECT MAX(id) FROM tool_log) - 2000`,
      )
    } catch (e) {
      console.warn('[tool-log] write failed', { err: String(e) })
    }
  }

  // Wrap every server tool's execute with timing + logging. Suspending
  // client tools (no execute) pass through untouched. read_statement output
  // is redacted to its size — the blob is large and private.
  private withToolLog(agent: string, tools: ToolSet): ToolSet {
    const out: ToolSet = {}
    for (const [name, t] of Object.entries(tools)) {
      const exec = (t as { execute?: (input: unknown, opts: unknown) => Promise<unknown> }).execute
      if (typeof exec !== 'function') {
        out[name] = t
        continue
      }
      out[name] = {
        ...(t as object),
        execute: async (input: unknown, opts: unknown) => {
          const t0 = Date.now()
          try {
            const result = await exec(input, opts)
            const logged =
              name === 'read_statement' &&
              result &&
              typeof result === 'object' &&
              'text' in (result as Record<string, unknown>)
                ? {
                    ...(result as Record<string, unknown>),
                    text: `[${String((result as Record<string, unknown>).text).length} chars]`,
                  }
                : result
            this.logTool({ agent, tool: name, input, output: logged, ok: true, ms: Date.now() - t0 })
            return result
          } catch (e) {
            this.logTool({
              agent,
              tool: name,
              input,
              output: null,
              ok: false,
              error: String(e),
              ms: Date.now() - t0,
            })
            throw e
          }
        },
      } as ToolSet[string]
    }
    return out
  }

  // Read API for /api/debug/tool-log.
  async list_tool_log(limit = 100): Promise<{
    rows: Array<{
      id: number
      ts: number
      agent: string
      tool: string
      input: string | null
      output: string | null
      ok: number
      error: string | null
      ms: number
    }>
  }> {
    const rows = this.ctx.storage.sql
      .exec<{
        id: number
        ts: number
        agent: string
        tool: string
        input: string | null
        output: string | null
        ok: number
        error: string | null
        ms: number
      }>(
        `SELECT id, ts, agent, tool, input, output, ok, error, ms
         FROM tool_log ORDER BY id DESC LIMIT ?`,
        Math.min(Math.max(limit, 1), 500),
      )
      .toArray()
    return { rows }
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
      maxOutputTokens: 16384,
      stopWhen: stepCountIs(4),
    })
    return { entries: recorded, note: result.text.trim() }
  }

  // Async ingestion (owner call): draft a captured statement in the
  // background — same brain as the live statement agent (system prompt,
  // model, card_guide, strict batch validation), recording tool instead of
  // the suspending client tool. Proposed entries land on the capture row;
  // the Inbox offers review. Fired via waitUntil from the upload route and
  // the email worker — never blocks the user.
  // Queueing entry point (worker-callable): hand the job to the DO's own
  // durable scheduler and return immediately. The caller's waitUntil
  // lifetime CANNOT kill the run — a 217s model call once outlived the
  // route worker and the retry loop died mid-flight, leaving the capture
  // stuck in 'processing'.
  async draftStatementAsync(statementId: string): Promise<{ ok: boolean; entries: number }> {
    await this.__unsafe_ensureInitialized()
    await this.schedule(0, 'runDraftStatement', statementId)
    return { ok: true, entries: 0 }
  }

  async runDraftStatement(statementId: string): Promise<{ ok: boolean; entries: number }> {
    const ledger = this.ledgerStub()
    const t0 = Date.now()
    try {
      const stmt = await ledger.get_statement(statementId)
      if (!stmt) return { ok: false, entries: 0 }
      const capture = (await ledger.list_captures()).rows.find((r) => r.id === statementId)
      await ledger.set_capture_state(statementId, 'processing')
      const snapshot = await ledger.ledger_snapshot()

      // Deterministic pipeline (owner decision): two small JSON-only model
      // calls (extract, classify) — no tools, no bulk payloads over the
      // flaky tool-call channel — then code renders the beancount: points
      // floor math, refund mirroring, pad+balance bookends, Cr signs.
      const gen = async (system: string, prompt: string, maxTokens: number) => {
        // STREAM, don't generate: a non-streaming call that takes long to
        // produce a big JSON payload hits Workers AI's completion timeout
        // (AiError 3046) and every retry re-runs the same slow call. A
        // streamed response keeps the connection alive token-by-token, so
        // long extractions complete instead of timing out.
        const r = streamText({
          model: this.buildModel({ id: STATEMENT_MODEL_ID, reasoning: 'off' }),
          system,
          prompt,
          maxOutputTokens: maxTokens,
        })
        let text = ''
        let lastWrite = 0
        for await (const delta of r.textStream) {
          text += delta
          const now = Date.now()
          if (now - lastWrite > 1000) {
            lastWrite = now
            // Think's setState broadcasts to any connected useAgent client
            // (the Inbox opens one only for a selected, still-drafting item).
            try {
              this.setState({ draftProgress: text.slice(-700) })
            } catch {
              /* no-op if state sync unavailable */
            }
          }
        }
        return text
      }
      const kbHttp = kbHttpOverFetch('https://kb', this.env.KB)
      const result = await runDraftPipeline({
        gen,
        kb: kbHttp,
        statementText: stmt.text,
        accounts: snapshot.accounts.map((a) => a.account),
        // Same convention stack as the editor's statement agent — only the
        // output channel differs (JSON entries).
        system: buildStatementIrSystem(),
        instruction: capture?.prompt,
      })

      try {
        this.setState({})
      } catch {
        /* no-op */
      }
      if (result.ok && result.entries.length > 0) {
        // Pipeline diagnostics (validation issues, omission reasons) are
        // internal: they go to the tool log in full, never onto the
        // product surface (owner call).
        await ledger.set_capture_drafts(statementId, result.entries, null)
      } else {
        await ledger.set_capture_error(
          statementId,
          result.error || 'pipeline produced no entries',
        )
      }
      this.logTool({
        agent: 'async-ingest',
        tool: 'draft_pipeline',
        input: { statement_id: statementId, filename: stmt.filename },
        output: {
          entries: result.entries.length,
          stages: result.stages,
          error: result.error,
          validation_issues: result.validation_issues,
        },
        ok: result.ok,
        ms: Date.now() - t0,
      })
      return { ok: result.ok, entries: result.entries.length }
    } catch (e) {
      await this.ledgerStub()
        .set_capture_error(statementId, String(e))
        .catch((): undefined => undefined)
      this.logTool({
        agent: 'async-ingest',
        tool: 'draft_pipeline',
        input: { statement_id: statementId },
        output: null,
        ok: false,
        error: String(e),
        ms: Date.now() - t0,
      })
      return { ok: false, entries: 0 }
    }
  }

  // Instance names: "<email>" (the main editor chat) or "<email>::<captureId>"
  // (a per-Inbox-item thread). The ledger is always the user's — parse the
  // email off the left.
  private ownerEmail(): string {
    return this.name.split('::')[0]!
  }

  // The capture id when this instance is an Inbox thread, else null.
  private threadCaptureId(): string | null {
    const i = this.name.indexOf('::')
    return i === -1 ? null : this.name.slice(i + 2)
  }

  // Cost hygiene: when an Inbox item is posted or dismissed, its thread DO is
  // destroyed — storage wiped, alarms cleared, nothing left to bill.
  async destroyThread(): Promise<{ ok: true }> {
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
    // deleteAll guts the agents framework's own tables out from under the
    // LIVE instance — a subsequent schedule() on it dies with "no such
    // table: cf_agents_schedules" (caught by the e2e smoke). Evict after
    // the response flushes; the next touch reconstructs from scratch.
    this.ctx.waitUntil(
      (async () => {
        await new Promise((r) => setTimeout(r, 100))
        this.ctx.abort()
      })(),
    )
    return { ok: true }
  }

  private ledgerStub(): DurableObjectStub<LedgerDO> {
    const ns = this.env.LEDGER_DO as unknown as DurableObjectNamespace<LedgerDO>
    return ns.get(ns.idFromName(this.ownerEmail()))
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
    const base =
      name === 'ledger'
        ? buildLedgerSystem(this.snapshot())
        : buildStatementAgentSystem(this.snapshot())
    return base + this.threadContextBlock() + this.handoffContextBlock()
  }

  // Inbox-item threads are anchored to one statement: tell the agent which
  // one, so "why is row 7 categorized like that?" works without the user
  // pasting ids. Drafts proposed by the background run (if any) are on the
  // capture row — the user sees them above this chat.
  private threadContextBlock(): string {
    const captureId = this.threadCaptureId()
    if (!captureId) return ''
    return `

## This thread
This conversation is scoped to ONE Inbox item: statement id "${captureId}".
Use read_statement({ statement_id: "${captureId}" }) to read its text when
the user asks about its contents. A background run may already have proposed
draft entries for it (shown to the user above this chat) — do not re-draft
the whole statement unless the user asks; answer questions, adjust specific
entries, or draft corrections.`
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
      return this.withToolLog(name, {
        ...kbLookup,
        card_guide,
        draft_transaction: draftTransactionTool(),
        clarify: clarifyTool(),
        add_card: addCardTool(),
      })
    }
    return this.withToolLog(name, {
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
    })
  }

  // ---- History hygiene: redact heavy statement-text outputs ----

  override async onChatResponse(result: ChatResponseResult): Promise<void> {
    await super.onChatResponse(result)

    // Observability: record the fate of every draft_transaction part this
    // turn — the suspending client tool never executes server-side, so this
    // is the only place to see whether the model's batch survived schema
    // parsing and what the client will render (state, entry count, whether
    // the reward accrual made it).
    try {
      const msgs = await this.syncMessagesFromStorage()
      const last = msgs[msgs.length - 1]
      const parts = Array.isArray(last?.parts) ? (last.parts as Array<Record<string, unknown>>) : []
      for (const part of parts) {
        const type = String(part.type ?? '')
        const isDraft =
          type === 'tool-draft_transaction' ||
          (type === 'dynamic-tool' && part.toolName === 'draft_transaction')
        if (!isDraft) continue
        const input = part.input as { transactions?: unknown[] } | undefined
        const txns = Array.isArray(input?.transactions) ? input.transactions : null
        this.logTool({
          agent: 'turn-audit',
          tool: 'draft_transaction.part',
          input: {
            state: part.state ?? null,
            entries: txns ? txns.length : null,
            has_accrual: txns
              ? txns.some((t) => typeof t === 'string' && t.includes('#reward-accrual'))
              : null,
          },
          output: part.errorText ?? null,
          ok: part.state !== 'output-error',
          ms: 0,
        })
      }
    } catch (e) {
      console.warn('[turn-audit] failed', { err: String(e) })
    }

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
