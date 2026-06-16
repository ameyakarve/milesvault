import type { ChatResponseResult } from '@cloudflare/think'
import { generateText, streamText, stepCountIs, tool, type ToolSet } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { z } from 'zod'
import {
  draftTransactionBatchSchema,
  clarifyInputSchema,
  addCardInputSchema,
} from './agent-ui-schemas'
import {
  buildLedgerSystem,
  buildStatementAgentSystem,
  buildIncorporationConventions,
  CLARIFICATIONS,
} from './agent-prompt'
import type { LedgerDO } from './ledger-do'
import { BaseAgentDO } from './base-agent-do'
import {
  makeEditorRegistry,
  STATEMENT_MODEL_ID,
  LEDGER_MODEL_ID,
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
  readStatementTool,
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
      execute: async ({ entries }) => {
        recorded.push(...entries.map((e) => e.text))
        return { ok: true, recorded: entries.length }
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

      // Spin the editor's OWN brain off THIS capture's object (owner call):
      // the per-capture DO runs the same statement agent the live editor
      // hosts — same system prompt, model, KG / card_guide lookups, and the
      // standard per-entry draft validation (draftTransactionBatchSchema
      // bounces a malformed entry back to the model in-loop). The ONE swap is
      // the output channel: with no live client to suspend on during this
      // async pass, draft_transaction is a RECORDING tool that collects the
      // proposed entries, and clarify records its question instead of
      // blocking. Nothing is committed here — the entries land on the capture
      // row; the user approves them by opening this same object in the editor.
      // No bespoke pipeline; this IS the editor mechanism.
      const recorded: string[] = []
      const questions: string[] = []
      const kbHttp = kbHttpOverFetch('https://kb', this.env.KB)
      const kb = makeKbTools(kbHttp)
      const draftingTools: ToolSet = {
        kb_resolve: kb.kb_resolve,
        kb_get: kb.kb_get,
        kb_related: kb.kb_related,
        card_guide: cardGuideTool(kbHttp),
        list_reward_accounts: rewardAccountsTool(kbHttp),
        draft_transaction: tool({
          description:
            'Propose one or more balanced beancount transactions for this statement. They are recorded for the user to review and approve — not committed here.',
          inputSchema: draftTransactionBatchSchema,
          execute: async ({ entries }) => {
            recorded.push(...entries.map((e) => e.text))
            return { ok: true, recorded: entries.length }
          },
        }),
        clarify: tool({
          description:
            'Record ONE short question when something required is genuinely ambiguous. There is no live user during this pass — the question rides along for the reviewer; it does NOT block drafting, so draft your best entries regardless.',
          inputSchema: clarifyInputSchema,
          execute: async ({ question }) => {
            questions.push(question)
            return { ok: true, recorded: true }
          },
        }),
        // Same read_statement the live statement agent uses — the prompt tells
        // the model to read the statement by id first. Plain fetch here (no
        // 'extracted' state-flip; this run owns the state machine).
        read_statement: readStatementTool(async (id) => {
          const blob = await ledger.get_statement(id)
          return blob ? { filename: blob.filename, text: blob.text } : null
        }),
      }

      // gemma-4-26b is multimodal: pass the page images straight to the model
      // as file parts alongside the statement text (owner call — no separate
      // OCR layer). The text carries exact amounts; the images let it read
      // what the text can't (labels banks render as graphics).
      const images = stmt.images ?? []
      // Async statement mode is not time-bound (owner call): run the FIRST step
      // with thinking ON so the model reasons through the whole statement in one
      // pass — every row, the reward math, and the pad+balance closings — then
      // drop to thinking OFF for the cheaper tool-loop follow-up steps (which
      // only need to re-emit corrected entries the validator bounced).
      const thinkOn = this.buildModel({ id: STATEMENT_MODEL_ID, reasoning: 'low' })
      const thinkOff = this.buildModel({ id: STATEMENT_MODEL_ID, reasoning: 'off' })
      const result = await generateText({
        model: thinkOff,
        prepareStep: ({ stepNumber }) => ({ model: stepNumber === 0 ? thinkOn : thinkOff }),
        system: buildStatementAgentSystem(snapshot),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${capture?.prompt?.trim() || 'Extract every transaction from this statement and draft balanced journal entries for the user to review.'}

<statement id="${statementId}" filename="${stmt.filename}" />

The statement's page images are attached below — use them for anything the text renders as graphics (e.g. a reward-points summary).`,
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
        // Generous budget: a thinking trace over a long statement plus the full
        // entry batch can run well past 16k; capping low truncates mid-output.
        maxOutputTokens: 32768,
        stopWhen: stepCountIs(EDITOR_MAX_STEPS),
      })

      try {
        this.setState({})
      } catch {
        /* no-op */
      }
      if (recorded.length > 0) {
        await ledger.set_capture_drafts(statementId, recorded, null)
      } else {
        // No entries proposed: surface the agent's own reason (a clarify
        // question, or its closing prose) rather than a generic message.
        await ledger.set_capture_error(
          statementId,
          questions[0] || result.text.trim() || 'the agent proposed no entries',
        )
      }
      this.logTool({
        agent: 'async-ingest',
        tool: 'statement_agent',
        input: { statement_id: statementId, filename: stmt.filename },
        output: {
          entries: recorded.length,
          questions,
          steps: result.steps.length,
          finish: result.finishReason,
        },
        ok: recorded.length > 0,
        ms: Date.now() - t0,
      })
      return { ok: recorded.length > 0, entries: recorded.length }
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
    const kb = makeKbTools(kbHttp)
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
    const tools: ToolSet = {
      kb_resolve: kb.kb_resolve,
      kb_get: kb.kb_get,
      kb_related: kb.kb_related,
      card_guide: cardGuideTool(kbHttp),
      list_reward_accounts: rewardAccountsTool(kbHttp),
      get_entry: getEntryTool((ref) => this.ledgerStub().get_entry(ref)),
      search: searchTool((filter) => this.ledgerStub().search_postings(filter)),
      draft_transaction: capture('draft_transaction', draftTransactionBatchSchema),
      clarify: capture('clarify', clarifyInputSchema),
      add_card: capture('add_card', addCardInputSchema),
    }
    try {
      const result = await generateText({
        // Mirror the real ledger agent's model (the bench runs buildLedgerSystem
        // + the ledger tools) — NOT the statement model.
        model: this.buildModel({ id: LEDGER_MODEL_ID, reasoning: 'off' }),
        system: buildLedgerSystem(snapshot, aliases),
        prompt: message,
        tools,
        stopWhen: stepCountIs(EDITOR_MAX_STEPS),
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

  // ---- AgentHost<EditorAgentName> ----

  system(name: EditorAgentName): string {
    const base =
      name === 'ledger'
        ? buildLedgerSystem(this.snapshot(), this.aliasCache?.map)
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
    // Editor gets full KG access incl. edge traversal (kb_related) — that's
    // where transfer ratios / reward-pool / card relationships live.
    const kbLookup = { kb_resolve: kb.kb_resolve, kb_get: kb.kb_get, kb_related: kb.kb_related }
    // The card drafting guide (earn rules + worked examples) — both agents
    // draft card transactions, so both get it.
    const card_guide = cardGuideTool(kbHttp)
    // Closed-set reward-account list: the editor picks miles/points accounts from
    // here (assembled in the KG) instead of building the path itself — gemma
    // resolves the right programme but drops the `:Miles:` segment when assembling.
    const list_reward_accounts = rewardAccountsTool(kbHttp)
    // Codemode read (find entries + answer questions) and per-entry read (the
    // model copies raw_text into draft_transaction's `replaces` to edit/delete).
    const get_entry = getEntryTool((ref) => this.ledgerStub().get_entry(ref))
    const search = searchTool((filter) => this.ledgerStub().search_postings(filter))
    if (name === 'ledger') {
      // Tool-using authoring agent: look things up (kb_*, card_guide,
      // list_reward_accounts, search, get_entry) and author directly via
      // draft_transaction (add = text; edit = replaces + text; delete = replaces).
      // No query_sql — finding entries is search's job; analytics is the
      // concierge/analyst surface.
      return this.withToolLog(name, {
        ...kbLookup,
        card_guide,
        list_reward_accounts,
        search,
        get_entry,
        draft_transaction: draftTransactionTool(),
        clarify: clarifyTool(CLARIFICATIONS),
        add_card: addCardTool(),
      })
    }
    return this.withToolLog(name, {
      ...kbLookup,
      card_guide,
      draft_transaction: draftTransactionTool(),
      clarify: clarifyTool(CLARIFICATIONS),
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
