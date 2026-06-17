import type { ChatResponseResult, TurnConfig, TurnContext } from '@cloudflare/think'
import {
  generateText,
  generateObject,
  streamText,
  stepCountIs,
  tool,
  jsonSchema,
  NoSuchToolError,
  type ToolSet,
  type ModelMessage,
  type ToolCallRepairFunction,
} from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { z } from 'zod'
import {
  draftTransactionBatchSchema,
  clarifyInputSchema,
  addCardInputSchema,
} from './agent-ui-schemas'
import {
  buildLedgerSystem,
  buildIncorporationConventions,
  turnInvolvesStatement,
  CLARIFICATIONS,
} from './agent-prompt'
import type { LedgerDO } from './ledger-do'
import { BaseAgentDO } from './base-agent-do'
import {
  makeEditorRegistry,
  STATEMENT_MODEL_ID,
  EDITOR_MAX_STEPS,
  type EditorAgentName,
} from './agents/registries/editor'
import {
  cardGuideTool,
  rewardAccountsTool,
  rewardAccountAliases,
  draftTransactionTool,
  clarifyTool,
  addCardTool,
  getEntryTool,
  searchTool,
} from './agents/tools/editor'
import { validateDraftBatch } from '@/lib/beancount/validate-draft-batch'
import { runIncorporation } from './ingest/incorporate'
import { makeKbTools, kbHttpOverFetch } from './agents/tools/concierge/kb-tools'
import { type GenFn } from './ingest/pipeline'
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

// Draft validation is the SDK's standard tool-input path: the `draft_transaction`
// inputSchema (draftTransactionBatchSchema.superRefine) validates the IR and
// attaches per-entry issues; on failure the SDK surfaces them to the model and
// the draft card renders as a failed/rejected call. No repair hook, no separate
// feedback tool.

// Eval-bench judge model — a stronger, non-gemma instruct model (the editor
// runs gemma; it cannot grade itself). Used only by __bench_judge.
const BENCH_JUDGE_MODEL_ID = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

// Pull the eval-relevant signals out of a tool-call trace so promptfoo's
// javascript asserts read flat fields instead of re-parsing the trace each
// time: the drafted entries, the clarify calls, and the SQL queries.
//
// `drafts` is ONLY the LAST draft_transaction call's entries — the final
// proposal the user would approve. The schema's superRefine bounces invalid
// drafts back to the model, which repairs them in-turn (same as production);
// grading must judge the repaired result, not the rejected intermediate
// attempts, so earlier draft calls are intentionally dropped here.
function deriveBenchSignals(trace: Array<{ tool: string; input: unknown }>): {
  drafts: Array<{ replaces: string | null; text: string }>
  clarifies: unknown[]
  sqls: string[]
} {
  let drafts: Array<{ replaces: string | null; text: string }> = []
  const clarifies: unknown[] = []
  const sqls: string[] = []
  for (const t of trace) {
    const input = (t.input ?? {}) as Record<string, unknown>
    if (t.tool === 'draft_transaction') {
      const entries = Array.isArray(input.entries) ? input.entries : []
      drafts = (entries as Array<Record<string, unknown>>).map((e) => ({
        replaces: typeof e.replaces === 'string' ? e.replaces : null,
        text: typeof e.text === 'string' ? e.text : '',
      }))
    } else if (t.tool === 'clarify') {
      clarifies.push(input)
    } else if (t.tool === 'query_sql') {
      if (typeof input.sql === 'string') sqls.push(input.sql)
    }
  }
  return { drafts, clarifies, sqls }
}

// Validate the drafted entries with the REAL draft validator (parse, shape,
// per-currency balance) — the same gate the editor's draft_transaction tool
// enforces. Delete ops (empty text) carry nothing to validate. Empty draft set
// is valid by default (a read turn has no drafts; assert presence separately).
function validateBenchDrafts(drafts: Array<{ replaces: string | null; text: string }>): {
  draftsValid: boolean
  draftIssues: string[]
} {
  const texts = drafts.map((d) => d.text).filter((t) => t.trim().length > 0)
  if (texts.length === 0) return { draftsValid: true, draftIssues: [] }
  const result = validateDraftBatch(texts)
  if ('issues' in result) {
    return { draftsValid: false, draftIssues: result.issues.map((i) => i.message) }
  }
  return { draftsValid: true, draftIssues: [] }
}

function todayInt(): number {
  const now = new Date()
  const yyyy = now.getUTCFullYear().toString().padStart(4, '0')
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0')
  const dd = now.getUTCDate().toString().padStart(2, '0')
  return Number(`${yyyy}${mm}${dd}`)
}

function isoFromInt(d: number): string {
  return `${Math.floor(d / 10000)}-${String(Math.floor((d % 10000) / 100)).padStart(2, '0')}-${String(d % 100).padStart(2, '0')}`
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
  // account → "also known as" (KG aliases), for the editor account manifest.
  // Cached by the set of accounts so we don't re-fetch the KG every turn.
  private aliasCache: { key: string; map: Record<string, string> } | null = null
  // Whether THIS turn involves a statement (set in beforeTurn from the turn's
  // messages) — gates the statement shards into the system prompt.
  private turnHasStatement = false

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
    // Same shared brain as the real ingest: the editor system prompt + the
    // capture toolset (recording draft_transaction).
    const { tools, recorded } = this.captureDraftTools()
    const result = await generateText({
      model: this.buildModel({ id: STATEMENT_MODEL_ID, reasoning: 'off' }),
      system: buildLedgerSystem(snapshot),
      prompt: `${opts.instruction?.trim() || 'Extract the transaction(s) from this forwarded email and draft journal entries.'}

--- forwarded email ---
${opts.text}`,
      tools,
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

  async runDraftStatement(statementId: string): Promise<{
    ok: boolean
    entries: number
    drafts?: string[]
    questions?: string[]
    text?: string
    draftsValid?: boolean
    trace?: { tool: string }[]
    error?: string | null
  }> {
    const ledger = this.ledgerStub()
    const t0 = Date.now()
    try {
      const stmt = await ledger.get_statement(statementId)
      if (!stmt) return { ok: false, entries: 0 }
      const capture = (await ledger.list_captures()).rows.find((r) => r.id === statementId)
      await ledger.set_capture_state(statementId, 'processing')
      const snapshot = await ledger.ledger_snapshot()

      // Spin the editor's OWN brain off THIS capture's object (owner call): the
      // per-capture DO runs the same editor agent via the SHARED builders — the
      // SAME system prompt the live editor uses (buildLedgerSystem, with the
      // account alias map) and the SAME lookup tools — so the two paths can't
      // drift. The only deltas are headless ones: draft_transaction RECORDS
      // (captureDraftTools) instead of suspending on a client, tool_choice is
      // 'required' so the model can't bail to a prose/```python "answer", and
      // draft_transaction is TERMINAL. First-turn contract: assume the statement
      // is good enough, produce ONE batch, no clarify (the user iterates after).
      const { tools: draftingTools, recorded } = this.captureDraftTools()
      // Same alias map the editor turn builds (beforeTurnFetch doesn't run for a
      // scheduled task) — tells the model each held account's canonical pool /
      // ticker so it doesn't drift the reward currency.
      const kbHttp = kbHttpOverFetch('https://kb', this.env.KB)
      const aliases = await rewardAccountAliases(
        kbHttp,
        snapshot.accounts.map((a) => ({ account: a.account, currencies: a.currencies })),
      ).catch((): Record<string, string> => ({}))

      // gemma-4-26b is multimodal: pass the page images straight to the model
      // as file parts alongside the statement text (owner call — no separate
      // OCR layer). The text carries exact amounts; the images let it read
      // what the text can't (labels banks render as graphics).
      const images = stmt.images ?? []
      // SHARED INVOCATION, SEPARATE PATH. This is the dedicated statement-ingest
      // path — NOT an editor turn (the editor's in-chat statement handling is a
      // UI convenience, not the supported route). But the way it CALLS the model
      // must not drift from the live turn, so we build the invocation from the
      // SAME single source the framework uses: `modelInvocation(<entry agent's
      // ModelConfig>)` gives the identical model build, output-token budget
      // (16384, not the bespoke 32768 that crept in), step budget, and tool-call
      // repair hook. The only DELIBERATE deltas here are headless ones: the
      // statement system shards, the recording draft_transaction (no client to
      // suspend on), and draft_transaction being TERMINAL.
      const inv = this.modelInvocation(this.registry.agents[this.registry.entry]!.model)
      // Capture any mid-stream model/gateway error instead of letting
      // consumeStream() swallow it. Without this, a failed generation AFTER a
      // successful lookup (e.g. a transient workers-ai error on the draft step)
      // leaves `recorded` empty and the run gets mislabeled "proposed no
      // entries" — indistinguishable from the model genuinely drafting nothing,
      // and not surfaced as the retryable error it actually is.
      let streamError: unknown = null
      // 120s wall-clock cap. Hoisted (not inline) so we can inspect `.aborted`
      // after the run: a timeout fires the SDK's onAbort, NOT onError — so an
      // abort leaves `streamError` null and `finishReason` non-'error', and the
      // run would otherwise be misclassified as "the model drafted nothing"
      // instead of the real, retryable timeout it is.
      const draftAbort = AbortSignal.timeout(120_000)
      const stream = streamText({
        model: inv.model,
        abortSignal: draftAbort,
        // Same tool-call repair the live turn gets — recovers a malformed/garbled
        // tool call instead of letting the loop die on it (gemma garbles large
        // draft_transaction args). NO toolChoice → 'auto', exactly like the turn.
        experimental_repairToolCall: inv.repairToolCall,
        onError: ({ error }) => {
          streamError = error
        },
        system: buildLedgerSystem(snapshot, aliases, { statement: true }),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${capture?.prompt?.trim() || 'Extract every transaction from this statement and draft balanced journal entries for the user to review.'}

The statement's extracted TEXT is below and its page IMAGES are attached — the text carries the exact amounts/dates/merchants; use the images for anything rendered as graphics (e.g. a reward-points box). Reason over both together.

--- statement: ${stmt.filename} ---
${stmt.text}`,
              },
              ...images.map((url) => ({
                type: 'file' as const,
                data: url.replace(/^data:[^,]+,/, ''),
                mediaType: url.match(/^data:([^;]+)/)?.[1] ?? 'image/jpeg',
              })),
            ],
          },
        ],
        tools: draftingTools,
        ...(inv.maxOutputTokens !== undefined ? { maxOutputTokens: inv.maxOutputTokens } : {}),
        // draft_transaction is TERMINAL: stop the moment a valid batch is
        // recorded. A bounced (invalid) draft records nothing, so the validator
        // retry still runs; lookups (card_guide) are non-terminal. The step
        // budget is the SHARED one (inv.maxSteps), not a separate cap.
        stopWhen: [() => recorded.length > 0, stepCountIs(inv.maxSteps ?? EDITOR_MAX_STEPS)],
      })
      // Surface (don't swallow) a stream error: consumeStream's own onError
      // keeps it from throwing, but `streamError` above still captures it.
      await stream.consumeStream({ onError: (e) => (streamError = streamError ?? e) })
      const text = await Promise.resolve(stream.text).catch(() => '')
      const steps = await Promise.resolve(stream.steps).catch(
        () => [] as Awaited<typeof stream.steps>,
      )
      const finishReason = await Promise.resolve(stream.finishReason).catch(
        () => 'error' as const,
      )
      const trace = steps.flatMap((s) =>
        (s.toolCalls ?? []).map((tc) => ({ tool: tc.toolName })),
      )
      // An errored generation (provider/gateway failure, OR a 120s timeout/abort)
      // is NOT the same as "the model drafted nothing" — the first is a real,
      // retryable failure; only the second is a genuine empty proposal. A timeout
      // fires onAbort (not onError) and leaves finishReason non-'error', so it
      // MUST be detected via the abort signal — otherwise it falls through here
      // and gets mislabeled "the agent proposed no entries".
      const timedOut = draftAbort.aborted
      const errored = streamError != null || finishReason === 'error' || timedOut
      // The retryable failure reason, surfaced on the capture row AND returned to
      // the caller (the eval harness, so it stops reporting a generic message).
      const failReason = timedOut
        ? 'timed out after 120s (statement too large/complex to draft in one pass)'
        : streamError != null
          ? String(streamError)
          : 'model generation failed'

      try {
        this.setState({})
      } catch {
        /* no-op */
      }
      if (recorded.length > 0) {
        await ledger.set_capture_drafts(statementId, recorded, null)
      } else if (errored) {
        // Real model/gateway error or timeout mid-run — record the actual cause so
        // the Inbox shows it (and offers Retry) instead of a misleading
        // "proposed no entries".
        console.error('[async-ingest] statement draft errored', {
          statement_id: statementId,
          finishReason,
          timedOut,
          steps: steps.length,
          trace,
          error: failReason,
        })
        await ledger.set_capture_error(statementId, `draft failed: ${failReason}`)
      } else {
        // No error and no entries: the model genuinely proposed nothing. Surface
        // its closing prose if any, else a generic note.
        console.warn('[async-ingest] statement draft produced no entries', {
          statement_id: statementId,
          finishReason,
          steps: steps.length,
          trace,
        })
        await ledger.set_capture_error(
          statementId,
          text.trim() || 'the agent proposed no entries',
        )
      }
      this.logTool({
        agent: 'async-ingest',
        tool: 'statement_agent',
        input: { statement_id: statementId, filename: stmt.filename },
        output: {
          entries: recorded.length,
          steps: steps.length,
          finish: finishReason,
          trace,
        },
        ok: recorded.length > 0,
        error: errored ? failReason : null,
        ms: Date.now() - t0,
      })
      // Rich detail (ignored by the scheduler; consumed by the test harness so
      // the eval can assert on the REAL ingest output — drafts, validity, the
      // tools the agent actually called, its closing prose, and the real failure
      // reason when there are no drafts — timeout vs error vs genuine-empty).
      return {
        ok: recorded.length > 0,
        entries: recorded.length,
        drafts: recorded,
        text,
        draftsValid: recorded.length > 0 ? validateDraftBatch(recorded).ok === true : false,
        trace,
        error: errored ? failReason : null,
      }
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

  // E2E harness only: run the incorporation engine against this user's ledger
  // for a given intent and return the ops (no draft card, no write). Lets the
  // test route exercise the REAL model + real entries end-to-end.
  async __test_runIncorporation(
    intent: string,
  ): Promise<{ ops: Array<{ id: string; text?: string; replaces?: string }>; dates: string[]; error: string | null }> {
    const snap = await this.ledgerStub().ledger_snapshot()
    return runIncorporation({
      gen: this.editGen(),
      intent,
      today: isoFromInt(snap.today),
      accounts: snap.accounts.map((a) => a.account),
      conventions: buildIncorporationConventions(),
      readDates: (dates) => this.ledgerStub().entries_on_dates(dates),
    })
  }

  // Plain JSON-text generation for the incorporation engine — non-thinking,
  // no tools (same model/path the statement pipeline uses).
  private editGen(): GenFn {
    return async ({ system, prompt, maxTokens }) => {
      const model = this.buildModel({ id: STATEMENT_MODEL_ID, reasoning: 'off' })
      const r = streamText({ model, system, prompt, maxOutputTokens: maxTokens })
      let text = ''
      for await (const delta of r.textStream) text += delta
      return text
    }
  }

  // E2E benchmark harness: run ONE editor turn headlessly with the REAL ledger
  // system prompt + REAL editor tools. Read tools (kb_*, card_guide,
  // list_reward_accounts, query_sql, get_entry) execute for real; the write/ask
  // tools (draft_transaction, clarify, add_card) are captured (not applied) so
  // we can see exactly what the model proposed. Returns the tool-call trace.
  async __bench_run(message: string): Promise<{
    text: string
    trace: Array<{ tool: string; input: unknown }>
    drafts: Array<{ replaces: string | null; text: string }>
    clarifies: unknown[]
    sqls: string[]
    draftsValid: boolean
    draftIssues: string[]
    aliases: Record<string, string>
    error: string | null
  }> {
    const snapshot = await this.ledgerStub().ledger_snapshot()
    const kbHttp = kbHttpOverFetch('https://kb', this.env.KB)
    const aliases = await rewardAccountAliases(
      kbHttp,
      snapshot.accounts.map((a) => ({ account: a.account, currencies: a.currencies })),
    ).catch((): Record<string, string> => ({}))
    const trace: Array<{ tool: string; input: unknown }> = []
    // Capture (don't apply) the write/ask tools — same schemas as the real ones,
    // so the model is constrained identically; we just record the call.
    const capture = (label: string, schema: z.ZodTypeAny) =>
      tool({
        description: `Propose (${label}). Fill it exactly as you would for the user.`,
        inputSchema: schema,
        execute: async () => ({ ok: true as const }),
      })
    // Shared lookup tools (same as the live editor + ingest) + captured writes.
    const tools: ToolSet = {
      ...this.lookupTools(),
      draft_transaction: capture('draft_transaction', draftTransactionBatchSchema),
      clarify: capture('clarify', clarifyInputSchema),
      add_card: capture('add_card', addCardInputSchema),
    }
    try {
      // Drive the bench through the SAME shared invocation production uses
      // (modelInvocation) — identical model build, output-token budget, step
      // budget, AND tool-call repair hook — so the eval actually MEASURES the
      // live turn instead of a hand-rolled approximation. (Previously this
      // generateText omitted maxOutputTokens and the repair hook, so the eval
      // silently graded a weaker config than production ran.)
      const inv = this.modelInvocation(this.registry.agents[this.registry.entry]!.model)
      const result = await generateText({
        model: inv.model,
        experimental_repairToolCall: inv.repairToolCall,
        system: buildLedgerSystem(snapshot, aliases, {
          statement: turnInvolvesStatement(message),
        }),
        prompt: message,
        tools,
        ...(inv.maxOutputTokens !== undefined ? { maxOutputTokens: inv.maxOutputTokens } : {}),
        stopWhen: stepCountIs(inv.maxSteps ?? EDITOR_MAX_STEPS),
      })
      for (const step of result.steps) {
        for (const call of step.toolCalls ?? []) {
          trace.push({ tool: call.toolName, input: call.input })
        }
      }
      const { drafts, clarifies, sqls } = deriveBenchSignals(trace)
      const { draftsValid, draftIssues } = validateBenchDrafts(drafts)
      return {
        text: result.text,
        trace,
        drafts,
        clarifies,
        sqls,
        draftsValid,
        draftIssues,
        aliases,
        error: null,
      }
    } catch (e) {
      const { drafts, clarifies, sqls } = deriveBenchSignals(trace)
      const { draftsValid, draftIssues } = validateBenchDrafts(drafts)
      return {
        text: '',
        trace,
        drafts,
        clarifies,
        sqls,
        draftsValid,
        draftIssues,
        aliases,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }

  // Grader model for the eval bench's llm-rubric assertions. promptfoo renders
  // its grading prompt and sends it here; we run a STRONGER model than the
  // editor (gemma is the thing under test — it can't grade itself) over the
  // Workers AI binding and return the raw text for promptfoo to parse. Keeps
  // the eval self-contained — no external grader API key. Remove with the rest
  // of the bench scaffolding.
  async __bench_judge(prompt: string): Promise<{ output: string }> {
    const gatewayId = this.env.AI_GATEWAY_ID
    const workersai = createWorkersAI({
      binding: this.env.AI,
      ...(gatewayId ? { gateway: { id: gatewayId } } : {}),
    })
    try {
      const { text } = await generateText({ model: workersai(BENCH_JUDGE_MODEL_ID), prompt })
      return { output: text }
    } catch (e) {
      return { output: `JUDGE_ERROR: ${e instanceof Error ? e.message : String(e)}` }
    }
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
  // prompt builders can't `await`). Also refresh the account-alias map (KG
  // read) so the editor manifest names what each account is — cached by the
  // account set so we hit the KG only when accounts change.
  protected override async beforeTurnFetch(): Promise<void> {
    this.turnSnapshot = await this.ledgerStub().ledger_snapshot()
    const accts = this.turnSnapshot.accounts.map((a) => ({
      account: a.account,
      currencies: a.currencies,
    }))
    const key = accts.map((a) => a.account).join('|')
    if (this.aliasCache?.key !== key) {
      const kbHttp = kbHttpOverFetch('https://kb', this.env.KB)
      const map = await rewardAccountAliases(kbHttp, accts).catch(
        (): Record<string, string> => ({}),
      )
      this.aliasCache = { key, map }
    }
  }

  // Detect whether this turn involves a statement (so system() gates the
  // statement shards in), then run the base turn prep (which also expands any
  // <statement id> into the model message via transformTurnMessages).
  override async beforeTurn(ctx: TurnContext): Promise<TurnConfig> {
    this.turnHasStatement = (ctx.messages ?? []).some((m) => {
      const c = m.content
      const text =
        typeof c === 'string'
          ? c
          : Array.isArray(c)
            ? c.map((p) => (p.type === 'text' ? p.text : '')).join('\n')
            : ''
      return turnInvolvesStatement(text)
    })
    return super.beforeTurn(ctx)
  }

  // ---- AgentHost<EditorAgentName> ----

  system(_name: EditorAgentName): string {
    // One editor agent (no handoff): it ingests statements itself, so the
    // statement shards are included only when THIS turn involves a statement
    // (set in beforeTurn) — plain edits get a leaner prompt.
    return (
      buildLedgerSystem(this.snapshot(), this.aliasCache?.map, {
        statement: this.turnHasStatement,
      }) +
      this.threadContextBlock() +
      this.handoffContextBlock()
    )
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

  // The SHARED read/lookup toolset. Built identically for every place that runs
  // this agent — the live editor turn, the headless statement capture
  // (runDraftStatement), and the bench — so they CANNOT drift. KG lookups
  // (kb_*, card_guide, list_reward_accounts) + ledger reads (search, get_entry).
  private lookupTools(): ToolSet {
    const kbHttp = kbHttpOverFetch('https://kb', this.env.KB)
    const kb = makeKbTools(kbHttp)
    return {
      kb_resolve: kb.kb_resolve,
      kb_get: kb.kb_get,
      kb_related: kb.kb_related,
      card_guide: cardGuideTool(kbHttp),
      list_reward_accounts: rewardAccountsTool(kbHttp),
      search: searchTool((filter) => this.ledgerStub().search_postings(filter)),
      get_entry: getEntryTool((ref) => this.ledgerStub().get_entry(ref)),
    }
  }

  // Generic, model-driven tool-call repair (applies to EVERY turn — editor AND
  // the headless ingest, since both run through modelInvocation). When the model
  // emits a tool call whose arguments don't parse/validate, the AI SDK's in-turn
  // bounce only fires if the generation finished cleanly with `tool-calls`; gemma
  // GARBLES large structured args (collapsed JSON, mashed account paths) and ends
  // the step with `finishReason: 'other'`, killing the loop before the bounce can
  // run. This hook intercepts that: it RE-ASKS the model to regenerate the
  // arguments for the SAME tool, given the tool's JSON schema and the parse error
  // — it never hand-repairs the garbled string (that would be exactly the kind of
  // arbiter/repair code the pipeline bans; the MODEL fixes its own output). It is
  // GENERIC: no card/beancount/draft specifics — just "your args were invalid,
  // here's the schema and the error, emit them again". Returns null to give up
  // (the caller then surfaces a real failure) if the re-ask itself fails.
  protected override getRepairToolCall(): ToolCallRepairFunction<ToolSet> {
    return async ({ toolCall, inputSchema, error, system, messages }) => {
      // INSTRUMENTATION (temporary): prove whether this hook is even entered and,
      // if so, exactly where it bails — so we stop guessing why repair never
      // fired on the Axis garble.
      console.error('[repair] ENTER', {
        tool: toolCall.toolName,
        errorName: (error as { name?: string })?.name,
        errorMsg: String((error as { message?: string })?.message ?? error).slice(0, 200),
        inputLen: String((toolCall as { input?: unknown }).input ?? '').length,
      })
      // Can't repair a call to a tool that doesn't exist — only invalid input.
      if (NoSuchToolError.isInstance(error)) {
        console.error('[repair] BAIL no-such-tool')
        return null
      }
      try {
        const schema = await inputSchema(toolCall)
        console.error('[repair] schema-ok', { hasSchema: schema != null, keys: schema && typeof schema === 'object' ? Object.keys(schema).slice(0, 8) : null })
        const { object } = await generateObject({
          model: this.modelInvocation(this.registry.agents[this.registry.entry]!.model).model,
          schema: jsonSchema(schema),
          system,
          messages: [
            ...messages,
            {
              role: 'user',
              content:
                `Your previous \`${toolCall.toolName}\` call had INVALID arguments and was rejected:\n${error.message}\n\n` +
                `Re-emit the corrected arguments now — the SAME content, fixed to satisfy the schema. ` +
                `Output only the arguments object.`,
            },
          ],
        })
        console.error('[repair] generateObject-ok', { objKeys: object && typeof object === 'object' ? Object.keys(object as object).slice(0, 8) : typeof object })
        return { ...toolCall, input: JSON.stringify(object) }
      } catch (e) {
        console.error('[repair] THREW', { where: 'inputSchema-or-generateObject', err: String(e).slice(0, 300) })
        // Re-ask failed (provider error, or the regeneration garbled too) — give
        // up cleanly; the turn ends and the caller surfaces it.
        return null
      }
    }
  }

  // Headless CAPTURE variant of the drafting toolset: the SAME lookups, with
  // draft_transaction RECORDING into a buffer instead of suspending on a live
  // client. Used by runDraftStatement (and previewDrafts) — the statement is
  // injected inline, so there's no read_statement, and clarify/add_card (client
  // tools) have no headless equivalent. Returns the buffer for the caller.
  private captureDraftTools(): { tools: ToolSet; recorded: string[] } {
    const recorded: string[] = []
    const tools = this.withToolLog('ledger', {
      ...this.lookupTools(),
      // The SAME draftTransactionTool the editor uses (dynamicTool — so garbled
      // args bounce a tool-error and the model re-emits), in RECORD mode: the
      // entry texts are captured here instead of suspending on a client.
      draft_transaction: draftTransactionTool({ record: (texts) => recorded.push(...texts) }),
    })
    return { tools, recorded }
  }

  // ONE editor agent (no handoff): freeform edits AND statement uploads. The
  // shared lookups + author tools (draft_transaction suspends for client
  // approval; add = text, edit = replaces + text, delete = replaces), clarify,
  // add_card, and read_statement (for a statement referenced by id in chat).
  tools(name: EditorAgentName): ToolSet {
    return this.withToolLog(name, {
      ...this.lookupTools(),
      draft_transaction: draftTransactionTool(),
      clarify: clarifyTool(CLARIFICATIONS),
      add_card: addCardTool(),
    })
  }

  // UI-ONLY CONVENIENCE — NOT the supported statement-ingest path. The canonical
  // path for statements is the dedicated capture/Inbox flow (runDraftStatement).
  // This only handles the incidental case of a user pasting a statement chip into
  // the editor chat: the client embeds a compact `<statement id="STMT-…"
  // filename="…" />` tag (rendered as a chip in the UI, kept small in stored
  // history) and here, per turn, we expand that tag into the full statement text
  // for the model only — so the model sees it inline without a fetch tool, and
  // the stored message / UI stay a chip (no token bloat). Do not grow features
  // onto this; statement ingest belongs on the dedicated path.
  protected override async transformTurnMessages(
    messages: ModelMessage[],
  ): Promise<ModelMessage[] | undefined> {
    const has = (s: string) => s.includes('<statement id="STMT-')
    const ids = new Set<string>()
    for (const m of messages) {
      if (m.role !== 'user') continue
      const text =
        typeof m.content === 'string'
          ? m.content
          : m.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n')
      for (const x of text.matchAll(/<statement\s+id="(STMT-[^"]+)"[^>]*\/>/g)) ids.add(x[1]!)
    }
    if (ids.size === 0) return undefined
    const blobs = new Map<string, string>()
    for (const id of ids) {
      const blob = await this.ledgerStub().get_statement(id).catch((): null => null)
      blobs.set(
        id,
        blob ? `--- statement: ${blob.filename} ---\n${blob.text}` : '[statement not found]',
      )
      if (blob) await this.ledgerStub().set_capture_state(id, 'extracted').catch(() => {})
    }
    const expand = (s: string) =>
      s.replace(/<statement\s+id="(STMT-[^"]+)"[^>]*\/>/g, (m, id) => blobs.get(id) ?? m)
    return messages.map((m) => {
      if (m.role !== 'user') return m
      if (typeof m.content === 'string') {
        return has(m.content) ? { ...m, content: expand(m.content) } : m
      }
      const parts = m.content.map((p) =>
        p.type === 'text' && has(p.text) ? { ...p, text: expand(p.text) } : p,
      )
      return { ...m, content: parts }
    })
  }

  // ---- History hygiene ----

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
        const input = part.input as { entries?: unknown[] } | undefined
        const ents = Array.isArray(input?.entries) ? input.entries : null
        this.logTool({
          agent: 'turn-audit',
          tool: 'draft_transaction.part',
          input: {
            state: part.state ?? null,
            entries: ents ? ents.length : null,
          },
          output: part.errorText ?? null,
          ok: part.state !== 'output-error',
          ms: 0,
        })
      }
    } catch (e) {
      console.warn('[turn-audit] failed', { err: String(e) })
    }
  }
}
