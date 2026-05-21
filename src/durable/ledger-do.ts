import { Think } from '@cloudflare/think'
import { createWorkersAI } from 'workers-ai-provider'
import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { buildSystemPrompt } from './agent-prompt'
import {
  accountCardSchema,
  barChartSchema,
  commitJournalEditSchema,
  donutChartSchema,
  heatmapSchema,
  lineChartSchema,
  proposeJournalEditSchema,
  stackedBarSchema,
} from './agent-ui-schemas'
import { SCHEMA_STEPS } from '@/lib/ledger-core/schema'
import {
  dateFromInt,
  dateToInt,
  directiveInputHash,
  serializeJournal,
  transactionInputHash,
} from '@/lib/beancount/ast'
import { isStrictParseErr, parseJournalStrict } from '@/lib/beancount/parse-strict'
import { validateAccountCurrencies } from '@/lib/beancount/validate-currency'
import {
  directiveTouchesAccount,
  directiveTouchesAccountCurrency,
} from '@/lib/beancount/scope'
import type {
  AccountEntriesResponse,
  AccountSummaryRow,
  DirectiveInput,
  Entry,
  EntryBalance,
  EntryClose,
  EntryDocument,
  EntryNote,
  EntryOpen,
  EntryPad,
  EntryTxn,
  Posting,
  PostingInput,
  TransactionInput,
} from './ledger-types'

const DATA_TABLES = [
  'transactions',
  'postings',
  'txn_tags',
  'txn_links',
  'directives_open',
  'directives_close',
  'directives_commodity',
  'directives_balance',
  'directives_pad',
  'directives_price',
  'directives_note',
  'directives_document',
  'directives_event',
] as const

export type JournalGetResponse = { text: string }
export type JournalPutResponse = { text: string; inserted: number; deleted: number; unchanged: number }
export type JournalPutError = {
  ok: false
  error: 'parse_error' | 'partial_parse' | 'unsupported_directives' | 'currency_lock'
  message: string
}
export type PreviewJournalPutResponse = {
  ok: true
  inserted: number
  deleted: number
  unchanged: number
}
export type ProposeJournalEditResponse =
  | {
      ok: true
      proposal_id: string
      instruction: string
      before_text: string
      proposed_text: string
      summary: { insert: number; delete: number; unchanged: number }
    }
  | JournalPutError
export type CommitJournalEditResponse =
  | (JournalPutResponse & { ok: true; proposal_id: string })
  | JournalPutError
  | { ok: false; error: 'no_such_proposal' | 'already_resolved'; message: string }

const ALL_DIRECTIVE_KINDS: DirectiveInput['kind'][] = [
  'open',
  'close',
  'commodity',
  'balance',
  'pad',
  'price',
  'note',
  'document',
  'event',
]

type JournalDiffResult =
  | JournalPutError
  | {
      ok: true
      inserted: number
      deleted: number
      unchanged: number
      txnsToInsert: Array<{ input: TransactionInput; hash: string }>
      txnIdsToDelete: number[]
      dirsToInsertByKind: Map<DirectiveInput['kind'], DirectiveInput[]>
      dirIdsToDeleteByKind: Map<DirectiveInput['kind'], number[]>
    }

const DIRECTIVE_TABLE: Record<DirectiveInput['kind'], string> = {
  open: 'directives_open',
  close: 'directives_close',
  commodity: 'directives_commodity',
  balance: 'directives_balance',
  pad: 'directives_pad',
  price: 'directives_price',
  note: 'directives_note',
  document: 'directives_document',
  event: 'directives_event',
}

type EntryRef = { kind: Entry['kind']; id: number; date: number }

// Parse a Beancount decimal string like "1234.56" or "-100" into a fixed-point
// (scaled, scale) pair. Returns null only on malformed input. The result fits
// safely in a JS Number for typical financial amounts (max ~9e15 / 10^scale).
function decimalToScaled(text: string): { scaled: number; scale: number } | null {
  const trimmed = text.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null
  const negative = trimmed.startsWith('-')
  const body = negative ? trimmed.slice(1) : trimmed
  const dot = body.indexOf('.')
  const intPart = dot === -1 ? body : body.slice(0, dot)
  const fracPart = dot === -1 ? '' : body.slice(dot + 1)
  const scale = fracPart.length
  const digits = intPart + fracPart
  const mag = Number(digits === '' ? '0' : digits)
  return { scaled: negative ? -mag : mag, scale }
}

const MODEL_ID = '@cf/moonshotai/kimi-k2.6'

export class LedgerDO extends Think {
  private db: SqlStorage

  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env)
    this.db = state.storage.sql
    this.migrate()
  }

  getModel() {
    const workersai = createWorkersAI({ binding: this.env.AI })
    return workersai(MODEL_ID)
  }

  getSystemPrompt(): string {
    // Synchronous per the Think API. Build from the cached snapshot — Think
    // calls this on every turn, so we recompute fresh each time.
    const snapshot = this.ledger_snapshot_sync()
    return buildSystemPrompt(snapshot)
  }

  getTools(): ToolSet {
    return {
      sql_query: tool({
        description:
          'Run a read-only SQL query against the ledger SQLite. Engine-enforced read-only; use parameters; LIMIT aggressively.',
        inputSchema: z.object({
          sql: z.string().describe('SELECT or WITH statement only.'),
          params: z
            .array(z.union([z.string(), z.number(), z.null()]))
            .optional()
            .describe('Positional parameters bound to ? placeholders.'),
        }),
        execute: async ({ sql, params }) => {
          try {
            return await this.query_sql(sql, params ?? [])
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) }
          }
        },
      }),
      show_stacked_bar: tool({
        description:
          'Render a stacked bar chart for category-over-time style questions. Use after gathering data with sql_query. Pick a small set of series (≤8) and convert scaled-decimal values to plain numbers (amount_scaled / POWER(10, scale)).',
        inputSchema: stackedBarSchema,
        execute: async (input) => input,
      }),
      show_bar_chart: tool({
        description:
          'Render a plain (non-stacked) bar chart. Use orientation="horizontal" for ranked lists like "top payees", "vertical" for time series. Same data shape as show_stacked_bar.',
        inputSchema: barChartSchema,
        execute: async (input) => input,
      }),
      show_line_chart: tool({
        description:
          'Render a line chart for trends over time (balance over months, daily spend). Wide-format data: each row has x_key plus one numeric value per series.',
        inputSchema: lineChartSchema,
        execute: async (input) => input,
      }),
      show_donut_chart: tool({
        description:
          'Render a donut chart for a single-period composition ("this month by category"). Provide each slice as {name, value, color?}.',
        inputSchema: donutChartSchema,
        execute: async (input) => input,
      }),
      show_heatmap: tool({
        description:
          'Render a calendar heatmap of daily spend across a date range ("when did I spend this year", "spend cadence last 90 days"). Provide one row per calendar day in the requested window (include zero-spend days too) with a positive `amount` representing that day\'s total outflow in the given currency.',
        inputSchema: heatmapSchema,
        execute: async (input) => input,
      }),
      show_account_card: tool({
        description:
          'Render an account summary card: current balance + a short list of recent transactions hitting this account. Use when the user asks about one specific account ("what\'s in my Chase Checking", "show me my Schwab brokerage"). Compute the balance as the SUM of postings in the requested currency; provide each recent posting as signed (positive = inflow, negative = outflow).',
        inputSchema: accountCardSchema,
        execute: async (input) => input,
      }),
      propose_journal_edit: tool({
        description:
          'Propose a Beancount journal edit. Provide a short `instruction` for the user-facing description, the `proposed_text` (full Beancount snippet that should replace the targets — balanced postings, explicit amounts + currencies), and optionally `target_txn_ids` of existing transactions to be replaced (omit for pure additions). The server validates the new journal, stores a pending proposal, and returns a proposal_id + diff summary. The user reviews the DiffCard before commit; do NOT call commit_journal_edit until they explicitly approve.',
        inputSchema: proposeJournalEditSchema,
        execute: async (input) =>
          this.propose_journal_edit({
            instruction: input.instruction,
            proposed_text: input.proposed_text,
            target_txn_ids: input.target_txn_ids,
          }),
      }),
      commit_journal_edit: tool({
        description:
          'Commit a previously proposed journal edit. Pass the `proposal_id` returned by propose_journal_edit. If the user tweaked the DiffCard, pass their final text via `edited_text`. Only call this after the user has explicitly approved the proposal.',
        inputSchema: commitJournalEditSchema,
        execute: async (input) =>
          this.commit_journal_edit({
            proposal_id: input.proposal_id,
            edited_text: input.edited_text,
          }),
      }),
    }
  }

  private migrate(): void {
    const v2Exists =
      (this.db
        .exec<{ n: number }>(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='transactions_v2'",
        )
        .toArray()[0]?.n ?? 0) > 0
    if (v2Exists) {
      this.db.exec('DROP TABLE IF EXISTS transactions')
      this.db.exec('ALTER TABLE transactions_v2 RENAME TO transactions')
    }
    for (const step of SCHEMA_STEPS) {
      try {
        this.db.exec(step.sql)
      } catch (e) {
        if (step.allowFail) continue
        console.error(`[migrate] step ${step.label} failed`, { err: String(e) })
        throw e
      }
    }
  }

  async journal_get(): Promise<JournalGetResponse> {
    return this.journal_get_sync()
  }

  journal_get_sync(): JournalGetResponse {
    const txnIds = this.db
      .exec<{ id: number }>('SELECT id FROM transactions ORDER BY date ASC, id ASC')
      .toArray()
      .map((r) => r.id)
    const transactions: TransactionInput[] = []
    for (const id of txnIds) {
      const e = this.readTxnEntry(id)
      if (e) transactions.push(entryTxnToInput(e))
    }
    const directives = this.readAllDirectives()
    return { text: serializeJournal(transactions, directives) }
  }

  async journal_get_for_account(account: string): Promise<JournalGetResponse> {
    const txnIds = this.db
      .exec<{ id: number }>(
        `SELECT id FROM transactions
         WHERE id IN (
           SELECT txn_id FROM postings WHERE account = ? OR account GLOB ?
         )
         ORDER BY date ASC, id ASC`,
        account,
        account + ':*',
      )
      .toArray()
      .map((r) => r.id)
    const transactions: TransactionInput[] = []
    for (const id of txnIds) {
      const e = this.readTxnEntry(id)
      if (e) transactions.push(entryTxnToInput(e))
    }
    const directives = this.readAllDirectives().filter((d) =>
      directiveTouchesAccount(d, account),
    )
    return { text: serializeJournal(transactions, directives) }
  }

  async journal_get_for_account_currency(
    account: string,
    currency: string,
  ): Promise<JournalGetResponse> {
    const txnIds = this.db
      .exec<{ id: number }>(
        `SELECT id FROM transactions
         WHERE id IN (
           SELECT txn_id FROM postings
           WHERE (account = ? OR account GLOB ?) AND currency = ?
         )
         ORDER BY date ASC, id ASC`,
        account,
        account + ':*',
        currency,
      )
      .toArray()
      .map((r) => r.id)
    const transactions: TransactionInput[] = []
    for (const id of txnIds) {
      const e = this.readTxnEntry(id)
      if (e) transactions.push(entryTxnToInput(e))
    }
    const directives = this.readAllDirectives().filter((d) =>
      directiveTouchesAccountCurrency(d, account, currency),
    )
    return { text: serializeJournal(transactions, directives) }
  }

  async list_account_children(account: string): Promise<string[]> {
    const glob = account + ':*'
    const deepGlob = account + ':*:*'
    const prefix = account + ':'
    const set = new Set<string>()
    const collect = (sql: string, ...binds: unknown[]) => {
      for (const r of this.db.exec<{ account: string }>(sql, ...binds).toArray()) {
        if (!r.account.startsWith(prefix)) continue
        const head = r.account.slice(prefix.length).split(':')[0]
        if (head) set.add(head)
      }
    }
    collect(`SELECT account FROM postings WHERE account GLOB ?`, glob)
    collect(
      `SELECT account FROM directives_balance WHERE account GLOB ? AND account NOT GLOB ?`,
      glob,
      deepGlob,
    )
    collect(`SELECT account FROM directives_open  WHERE account GLOB ?`, glob)
    collect(`SELECT account FROM directives_close WHERE account GLOB ?`, glob)
    collect(`SELECT account FROM directives_pad   WHERE account GLOB ?`, glob)
    collect(`SELECT account FROM directives_note  WHERE account GLOB ?`, glob)
    return [...set].sort()
  }

  async list_account_currencies(account: string): Promise<string[]> {
    const counts = new Map<string, number>()
    const glob = account + ':*'
    for (const r of this.db
      .exec<{ currency: string; n: number }>(
        `SELECT currency, COUNT(*) AS n FROM postings
         WHERE (account = ? OR account GLOB ?)
           AND currency IS NOT NULL AND currency != ''
         GROUP BY currency`,
        account,
        glob,
      )
      .toArray()) {
      counts.set(r.currency, (counts.get(r.currency) ?? 0) + r.n)
    }
    for (const r of this.db
      .exec<{ currency: string; n: number }>(
        `SELECT currency, COUNT(*) AS n FROM directives_balance
         WHERE account = ? OR account GLOB ?
         GROUP BY currency`,
        account,
        glob,
      )
      .toArray()) {
      counts.set(r.currency, (counts.get(r.currency) ?? 0) + r.n)
    }
    return [...counts.entries()]
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .map(([cur]) => cur)
  }

  async list_account_summaries(
    asOfInt: number,
  ): Promise<AccountSummaryRow[]> {
    const map = new Map<
      string,
      { account: string; currency: string; sumScaled12: bigint; lastActivity: number }
    >()
    const TARGET_SCALE = 12
    const upsert = (
      account: string,
      currency: string,
      delta: bigint,
      date: number,
    ): void => {
      const key = `${account}|${currency}`
      const existing = map.get(key)
      if (existing) {
        existing.sumScaled12 += delta
        if (date > existing.lastActivity) existing.lastActivity = date
        return
      }
      map.set(key, { account, currency, sumScaled12: delta, lastActivity: date })
    }
    for (const p of this.db
      .exec<{
        account: string
        currency: string
        amount_scaled: number
        scale: number
        date: number
      }>(
        `SELECT account, currency, amount_scaled, scale, date
         FROM postings
         WHERE date <= ? AND amount_scaled IS NOT NULL AND scale IS NOT NULL
           AND currency IS NOT NULL AND currency != ''`,
        asOfInt,
      )
      .toArray()) {
      const factor = 10n ** BigInt(TARGET_SCALE - p.scale)
      upsert(p.account, p.currency, BigInt(p.amount_scaled) * factor, p.date)
    }
    for (const r of this.db
      .exec<{ account: string; currency: string; date: number }>(
        `SELECT account, currency, date FROM directives_balance
         WHERE date <= ?`,
        asOfInt,
      )
      .toArray()) {
      const key = `${r.account}|${r.currency}`
      const existing = map.get(key)
      if (existing) {
        if (r.date > existing.lastActivity) existing.lastActivity = r.date
      } else {
        map.set(key, {
          account: r.account,
          currency: r.currency,
          sumScaled12: 0n,
          lastActivity: r.date,
        })
      }
    }
    for (const r of this.db
      .exec<{ account: string; constraint_currencies: string; date: number }>(
        `SELECT account, constraint_currencies, date FROM directives_open
         WHERE date <= ?`,
        asOfInt,
      )
      .toArray()) {
      let currencies: string[] = []
      try {
        currencies = JSON.parse(r.constraint_currencies) as string[]
      } catch {}
      for (const c of currencies) {
        const key = `${r.account}|${c}`
        if (!map.has(key)) {
          map.set(key, { account: r.account, currency: c, sumScaled12: 0n, lastActivity: r.date })
        }
      }
    }
    return [...map.values()].map((v) => ({
      account: v.account,
      currency: v.currency,
      balance_scaled: v.sumScaled12.toString(),
      scale: TARGET_SCALE,
      last_activity: v.lastActivity,
    }))
  }

  async journal_put(text: string): Promise<JournalPutResponse | JournalPutError> {
    const diff = await this.computeJournalDiff(text)
    if ('ok' in diff && diff.ok === false) return diff

    const allKinds = ALL_DIRECTIVE_KINDS
    const now = Date.now()
    this.ctx.storage.transactionSync(() => {
      for (const id of diff.txnIdsToDelete) {
        this.db.exec('DELETE FROM transactions WHERE id = ?', id)
      }
      for (const { input, hash } of diff.txnsToInsert) this.insertTxn(input, hash, now)
      for (const kind of allKinds) {
        const table = DIRECTIVE_TABLE[kind]
        for (const id of diff.dirIdsToDeleteByKind.get(kind)!) {
          this.db.exec(`DELETE FROM ${table} WHERE id = ?`, id)
        }
        for (const d of diff.dirsToInsertByKind.get(kind)!) this.insertDirective(d, now)
      }
    })

    const result = await this.journal_get()
    return {
      text: result.text,
      inserted: diff.inserted,
      deleted: diff.deleted,
      unchanged: diff.unchanged,
    }
  }

  async preview_journal_put(
    text: string,
  ): Promise<PreviewJournalPutResponse | JournalPutError> {
    const diff = await this.computeJournalDiff(text)
    if ('ok' in diff && diff.ok === false) return diff
    return {
      ok: true,
      inserted: diff.inserted,
      deleted: diff.deleted,
      unchanged: diff.unchanged,
    }
  }

  // Build the would-be new full-journal text by serializing the current
  // ledger excluding `excludeTxnIds`, then concatenating the agent's
  // proposed snippet. Order: existing surviving entries first (oldest →
  // newest), then proposed text — journal_put doesn't care about order.
  private composeJournalAfterEdit(
    excludeTxnIds: ReadonlyArray<number>,
    proposedText: string,
  ): { fullText: string; beforeText: string } {
    const excluded = new Set(excludeTxnIds.map((n) => Number(n)))

    const allTxnIds = this.db
      .exec<{ id: number }>('SELECT id FROM transactions ORDER BY date ASC, id ASC')
      .toArray()
      .map((r) => r.id)
    const surviving: TransactionInput[] = []
    const targeted: TransactionInput[] = []
    for (const id of allTxnIds) {
      const entry = this.readTxnEntry(id)
      if (!entry) continue
      const input = entryTxnToInput(entry)
      if (excluded.has(id)) targeted.push(input)
      else surviving.push(input)
    }
    const directives = this.readAllDirectives()
    const survivingText = serializeJournal(surviving, directives)
    const beforeText = targeted.length > 0 ? serializeJournal(targeted, []) : ''
    const trailing = proposedText.endsWith('\n') ? '' : '\n'
    const fullText = `${survivingText}\n\n${proposedText}${trailing}`
    return { fullText, beforeText }
  }

  async propose_journal_edit(opts: {
    instruction: string
    proposed_text: string
    target_txn_ids?: ReadonlyArray<number>
  }): Promise<ProposeJournalEditResponse> {
    const targets = opts.target_txn_ids ?? []
    const { fullText, beforeText } = this.composeJournalAfterEdit(
      targets,
      opts.proposed_text,
    )
    const diff = await this.computeJournalDiff(fullText)
    if ('ok' in diff && diff.ok === false) return diff

    const id = crypto.randomUUID()
    this.db.exec(
      `INSERT INTO agent_proposals (id, created_at, instruction, proposed_text, target_txn_ids, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      id,
      Date.now(),
      opts.instruction,
      opts.proposed_text,
      JSON.stringify(targets.map((n) => Number(n))),
    )

    return {
      ok: true,
      proposal_id: id,
      instruction: opts.instruction,
      before_text: beforeText,
      proposed_text: opts.proposed_text,
      summary: {
        insert: diff.inserted,
        delete: diff.deleted,
        unchanged: diff.unchanged,
      },
    }
  }

  async commit_journal_edit(opts: {
    proposal_id: string
    edited_text?: string
  }): Promise<CommitJournalEditResponse> {
    const row = this.db
      .exec<{
        instruction: string
        proposed_text: string
        target_txn_ids: string
        status: string
      }>(
        `SELECT instruction, proposed_text, target_txn_ids, status
         FROM agent_proposals WHERE id = ?`,
        opts.proposal_id,
      )
      .toArray()[0]
    if (!row) {
      return {
        ok: false,
        error: 'no_such_proposal',
        message: `No proposal with id ${opts.proposal_id}`,
      }
    }
    if (row.status !== 'pending') {
      return {
        ok: false,
        error: 'already_resolved',
        message: `Proposal ${opts.proposal_id} is already ${row.status}`,
      }
    }

    let targets: number[] = []
    try {
      const parsed = JSON.parse(row.target_txn_ids)
      if (Array.isArray(parsed)) targets = parsed.map((n) => Number(n))
    } catch {
      // treat as no targets
    }

    const text =
      typeof opts.edited_text === 'string' && opts.edited_text.length > 0
        ? opts.edited_text
        : row.proposed_text
    const { fullText } = this.composeJournalAfterEdit(targets, text)
    const result = await this.journal_put(fullText)
    if ('ok' in result && result.ok === false) return result

    this.db.exec(
      `UPDATE agent_proposals SET status = 'committed' WHERE id = ?`,
      opts.proposal_id,
    )

    const applied = result as JournalPutResponse
    return {
      ok: true,
      proposal_id: opts.proposal_id,
      text: applied.text,
      inserted: applied.inserted,
      deleted: applied.deleted,
      unchanged: applied.unchanged,
    }
  }

  // Pure diff against current DO state. Both journal_put (applies) and
  // preview_journal_put (validate-only) share this so a successful preview
  // guarantees the subsequent put parses and validates the same way.
  // TODO: parseJournalStrict already rejects elided postings (every posting
  // must carry an explicit amount + currency). Surface a dedicated error
  // kind ('elided_posting') so the UI can show a targeted message instead
  // of the generic 'parse_error'.
  private async computeJournalDiff(text: string): Promise<JournalDiffResult> {
    const parsed = parseJournalStrict(text)
    if (isStrictParseErr(parsed)) {
      return { ok: false, error: parsed.kind, message: parsed.message }
    }

    const issues = validateAccountCurrencies(parsed.transactions, parsed.directives)
    if (issues.length > 0) {
      return {
        ok: false,
        error: 'currency_lock',
        message: issues.map((i) => i.message).join('; '),
      }
    }

    const allKinds = ALL_DIRECTIVE_KINDS

    const incomingTxns: Array<{ input: TransactionInput; hash: string }> = []
    for (const input of parsed.transactions) {
      incomingTxns.push({ input, hash: await transactionInputHash(input) })
    }
    const incomingDirsByKind = new Map<
      DirectiveInput['kind'],
      Array<{ input: DirectiveInput; hash: string }>
    >()
    for (const kind of allKinds) incomingDirsByKind.set(kind, [])
    for (const d of parsed.directives) {
      const hash = await directiveInputHash(d)
      incomingDirsByKind.get(d.kind)!.push({ input: d, hash })
    }

    const oldTxnsByHash = new Map<string, number[]>()
    for (const r of this.db
      .exec<{ id: number; hash: string | null }>('SELECT id, hash FROM transactions')
      .toArray()) {
      const key = r.hash ?? ''
      if (!oldTxnsByHash.has(key)) oldTxnsByHash.set(key, [])
      oldTxnsByHash.get(key)!.push(r.id)
    }
    const oldDirsByKindHash = new Map<DirectiveInput['kind'], Map<string, number[]>>()
    for (const kind of allKinds) {
      const map = new Map<string, number[]>()
      for (const e of this.readDirectivesByKind(kind)) {
        const h = await directiveInputHash(e.input)
        if (!map.has(h)) map.set(h, [])
        map.get(h)!.push(e.id)
      }
      oldDirsByKindHash.set(kind, map)
    }

    const txnsToInsert: Array<{ input: TransactionInput; hash: string }> = []
    let unchanged = 0
    for (const item of incomingTxns) {
      const ids = oldTxnsByHash.get(item.hash)
      if (ids && ids.length > 0) {
        ids.shift()
        unchanged++
      } else {
        txnsToInsert.push(item)
      }
    }
    const txnIdsToDelete: number[] = []
    for (const ids of oldTxnsByHash.values()) txnIdsToDelete.push(...ids)

    const dirsToInsertByKind = new Map<DirectiveInput['kind'], DirectiveInput[]>()
    const dirIdsToDeleteByKind = new Map<DirectiveInput['kind'], number[]>()
    for (const kind of allKinds) {
      const incoming = incomingDirsByKind.get(kind)!
      const oldMap = oldDirsByKindHash.get(kind)!
      const toInsert: DirectiveInput[] = []
      for (const item of incoming) {
        const ids = oldMap.get(item.hash)
        if (ids && ids.length > 0) {
          ids.shift()
          unchanged++
        } else {
          toInsert.push(item.input)
        }
      }
      const idsToDelete: number[] = []
      for (const ids of oldMap.values()) idsToDelete.push(...ids)
      dirsToInsertByKind.set(kind, toInsert)
      dirIdsToDeleteByKind.set(kind, idsToDelete)
    }

    let inserted = txnsToInsert.length
    let deleted = txnIdsToDelete.length
    for (const kind of allKinds) {
      inserted += dirsToInsertByKind.get(kind)!.length
      deleted += dirIdsToDeleteByKind.get(kind)!.length
    }

    return {
      ok: true,
      inserted,
      deleted,
      unchanged,
      txnsToInsert,
      txnIdsToDelete,
      dirsToInsertByKind,
      dirIdsToDeleteByKind,
    }
  }

  async clear(): Promise<{ ok: true }> {
    for (const t of DATA_TABLES) {
      this.db.exec(`DELETE FROM ${t}`)
    }
    return { ok: true }
  }

  // Read-only SQL escape hatch used by the AI agent. Workerd's SQL authorizer
  // rejects `PRAGMA query_only` (not on its allowlist), so we lean on two
  // language-level invariants instead: DO `sql.exec` runs exactly one
  // statement per call, and SQL grammar doesn't permit DML nested inside a
  // SELECT — so a leading-keyword guard makes the call effectively read-only.
  async query_sql(
    sql: string,
    params: ReadonlyArray<string | number | null> = [],
  ): Promise<{
    columns: string[]
    rows: Array<Record<string, unknown>>
    truncated: boolean
  }> {
    const MAX_ROWS = 1000
    const stripped = sql
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--[^\n]*/g, '')
      .trimStart()
    if (!/^(select|with)\b/i.test(stripped)) {
      throw new Error('sql_query only accepts SELECT or WITH statements')
    }
    const cursor = this.db.exec(sql, ...params)
    const rows: Array<Record<string, unknown>> = []
    let truncated = false
    for (const row of cursor) {
      if (rows.length >= MAX_ROWS) {
        truncated = true
        break
      }
      rows.push(row as Record<string, unknown>)
    }
    const columns = cursor.columnNames as string[]
    return { columns, rows, truncated }
  }

  // Lightweight, per-turn ledger snapshot for the agent's context window.
  async ledger_snapshot(): Promise<{
    today: number
    accounts: Array<{ account: string; currencies: string[]; open_date: number; close_date: number | null }>
    row_counts: Record<string, number>
    sample_txns: string
  }> {
    return this.ledger_snapshot_sync()
  }

  ledger_snapshot_sync(): {
    today: number
    accounts: Array<{ account: string; currencies: string[]; open_date: number; close_date: number | null }>
    row_counts: Record<string, number>
    sample_txns: string
  } {
    const accounts = this.db
      .exec<{ account: string; constraint_currencies: string; date: number }>(
        `SELECT o.account, o.constraint_currencies, o.date
         FROM directives_open o
         ORDER BY o.account`,
      )
      .toArray()
    const closes = new Map<string, number>()
    for (const r of this.db
      .exec<{ account: string; date: number }>(
        `SELECT account, date FROM directives_close`,
      )
      .toArray()) {
      closes.set(r.account, r.date)
    }
    const accountList = accounts.map((r) => {
      let currencies: string[] = []
      try {
        const parsed = JSON.parse(r.constraint_currencies)
        if (Array.isArray(parsed)) currencies = parsed.map(String)
      } catch {
        // ignore malformed metadata
      }
      return {
        account: r.account,
        currencies,
        open_date: r.date,
        close_date: closes.get(r.account) ?? null,
      }
    })

    const counts: Record<string, number> = {}
    for (const t of DATA_TABLES) {
      const r = this.db
        .exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)
        .toArray()[0]
      counts[t] = r?.n ?? 0
    }

    const sampleResult = this.journal_get_sync()
    // Take the last ~5 entries from the journal text as a style sample. The
    // journal is rendered newest-first, so just grab the head N non-empty
    // lines worth.
    const sample_txns = sampleResult.text
      .split(/\n{2,}/)
      .slice(0, 5)
      .join('\n\n')

    const now = new Date()
    const yyyy = now.getUTCFullYear().toString().padStart(4, '0')
    const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0')
    const dd = now.getUTCDate().toString().padStart(2, '0')
    const today = dateToInt(`${yyyy}-${mm}-${dd}`)

    return { today, accounts: accountList, row_counts: counts, sample_txns }
  }

  private insertTxn(input: TransactionInput, hash: string, now: number): void {
    const dateInt = dateToInt(input.date)
    const flag = input.flag ?? null
    const payee = input.payee ?? ''
    const narration = input.narration ?? ''
    const meta = JSON.stringify(input.meta ?? {})
    const result = this.db.exec<{ id: number }>(
      `INSERT INTO transactions (date, flag, payee, narration, meta_json, hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      dateInt,
      flag,
      payee,
      narration,
      meta,
      hash,
      now,
      now,
    )
    const txnId = result.toArray()[0]!.id
    input.postings.forEach((p, idx) => this.insertPosting(txnId, idx, p, dateInt))
    for (const tag of input.tags ?? []) {
      this.db.exec(
        'INSERT OR IGNORE INTO txn_tags (txn_id, tag, from_stack) VALUES (?, ?, 0)',
        txnId,
        tag,
      )
    }
    for (const link of input.links ?? []) {
      this.db.exec(
        'INSERT OR IGNORE INTO txn_links (txn_id, link) VALUES (?, ?)',
        txnId,
        link,
      )
    }
  }

  private readAllDirectives(): DirectiveInput[] {
    const out: DirectiveInput[] = []
    out.push(...this.readDirectivesByKind('open').map((e) => e.input))
    out.push(...this.readDirectivesByKind('close').map((e) => e.input))
    out.push(...this.readDirectivesByKind('commodity').map((e) => e.input))
    out.push(...this.readDirectivesByKind('balance').map((e) => e.input))
    out.push(...this.readDirectivesByKind('pad').map((e) => e.input))
    out.push(...this.readDirectivesByKind('price').map((e) => e.input))
    out.push(...this.readDirectivesByKind('note').map((e) => e.input))
    out.push(...this.readDirectivesByKind('document').map((e) => e.input))
    out.push(...this.readDirectivesByKind('event').map((e) => e.input))
    return out
  }

  private readDirectivesByKind(
    kind: DirectiveInput['kind'],
  ): Array<{ id: number; input: DirectiveInput }> {
    switch (kind) {
      case 'open':
        return this.db
          .exec<{
            id: number
            date: number
            account: string
            booking_method: string | null
            constraint_currencies: string
            meta_json: string
          }>(
            'SELECT id, date, account, booking_method, constraint_currencies, meta_json FROM directives_open',
          )
          .toArray()
          .map((r) => ({
            id: r.id,
            input: {
              kind: 'open',
              date: dateFromInt(r.date),
              account: r.account,
              booking_method: r.booking_method,
              constraint_currencies: parseStringArray(r.constraint_currencies),
              meta: parseMetaOrNull(r.meta_json),
            },
          }))
      case 'close':
        return this.db
          .exec<{ id: number; date: number; account: string; meta_json: string }>(
            'SELECT id, date, account, meta_json FROM directives_close',
          )
          .toArray()
          .map((r) => ({
            id: r.id,
            input: {
              kind: 'close',
              date: dateFromInt(r.date),
              account: r.account,
              meta: parseMetaOrNull(r.meta_json),
            },
          }))
      case 'commodity':
        return this.db
          .exec<{ id: number; date: number; currency: string; meta_json: string }>(
            'SELECT id, date, currency, meta_json FROM directives_commodity',
          )
          .toArray()
          .map((r) => ({
            id: r.id,
            input: {
              kind: 'commodity',
              date: dateFromInt(r.date),
              currency: r.currency,
              meta: parseMetaOrNull(r.meta_json),
            },
          }))
      case 'balance':
        return this.db
          .exec<{
            id: number
            date: number
            account: string
            amount: string
            currency: string
            meta_json: string
          }>(
            'SELECT id, date, account, amount, currency, meta_json FROM directives_balance',
          )
          .toArray()
          .map((r) => ({
            id: r.id,
            input: {
              kind: 'balance',
              date: dateFromInt(r.date),
              account: r.account,
              amount: r.amount,
              currency: r.currency,
              meta: parseMetaOrNull(r.meta_json),
            },
          }))
      case 'pad':
        return this.db
          .exec<{
            id: number
            date: number
            account: string
            account_pad: string
            meta_json: string
          }>(
            'SELECT id, date, account, account_pad, meta_json FROM directives_pad',
          )
          .toArray()
          .map((r) => ({
            id: r.id,
            input: {
              kind: 'pad',
              date: dateFromInt(r.date),
              account: r.account,
              account_pad: r.account_pad,
              meta: parseMetaOrNull(r.meta_json),
            },
          }))
      case 'price':
        return this.db
          .exec<{
            id: number
            date: number
            commodity: string
            currency: string
            amount: string
            meta_json: string
          }>(
            'SELECT id, date, commodity, currency, amount, meta_json FROM directives_price',
          )
          .toArray()
          .map((r) => ({
            id: r.id,
            input: {
              kind: 'price',
              date: dateFromInt(r.date),
              commodity: r.commodity,
              currency: r.currency,
              amount: r.amount,
              meta: parseMetaOrNull(r.meta_json),
            },
          }))
      case 'note':
        return this.db
          .exec<{
            id: number
            date: number
            account: string
            description: string
            meta_json: string
          }>(
            'SELECT id, date, account, description, meta_json FROM directives_note',
          )
          .toArray()
          .map((r) => ({
            id: r.id,
            input: {
              kind: 'note',
              date: dateFromInt(r.date),
              account: r.account,
              description: r.description,
              meta: parseMetaOrNull(r.meta_json),
            },
          }))
      case 'document':
        return this.db
          .exec<{
            id: number
            date: number
            account: string
            filename: string
            meta_json: string
          }>(
            'SELECT id, date, account, filename, meta_json FROM directives_document',
          )
          .toArray()
          .map((r) => ({
            id: r.id,
            input: {
              kind: 'document',
              date: dateFromInt(r.date),
              account: r.account,
              filename: r.filename,
              meta: parseMetaOrNull(r.meta_json),
            },
          }))
      case 'event':
        return this.db
          .exec<{ id: number; date: number; name: string; value: string; meta_json: string }>(
            'SELECT id, date, name, value, meta_json FROM directives_event',
          )
          .toArray()
          .map((r) => ({
            id: r.id,
            input: {
              kind: 'event',
              date: dateFromInt(r.date),
              name: r.name,
              value: r.value,
              meta: parseMetaOrNull(r.meta_json),
            },
          }))
    }
  }

  private insertDirective(d: DirectiveInput, now: number): void {
    const dateInt = dateToInt(d.date)
    const meta = JSON.stringify(d.meta ?? {})
    switch (d.kind) {
      case 'open':
        this.db.exec(
          `INSERT INTO directives_open
             (date, account, booking_method, constraint_currencies, meta_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          dateInt,
          d.account,
          d.booking_method ?? null,
          JSON.stringify(d.constraint_currencies ?? []),
          meta,
          now,
          now,
        )
        return
      case 'close':
        this.db.exec(
          `INSERT INTO directives_close (date, account, meta_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          dateInt,
          d.account,
          meta,
          now,
          now,
        )
        return
      case 'commodity':
        this.db.exec(
          `INSERT INTO directives_commodity (date, currency, meta_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          dateInt,
          d.currency,
          meta,
          now,
          now,
        )
        return
      case 'balance': {
        const bal = decimalToScaled(d.amount)
        if (!bal) throw new Error(`unparseable balance amount: ${d.amount}`)
        this.db.exec(
          `INSERT INTO directives_balance
             (date, account, amount, amount_scaled, scale, currency, meta_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          dateInt,
          d.account,
          d.amount,
          bal.scaled,
          bal.scale,
          d.currency,
          meta,
          now,
          now,
        )
        return
      }
      case 'pad':
        this.db.exec(
          `INSERT INTO directives_pad (date, account, account_pad, meta_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          dateInt,
          d.account,
          d.account_pad,
          meta,
          now,
          now,
        )
        return
      case 'price': {
        const pr = decimalToScaled(d.amount)
        if (!pr) throw new Error(`unparseable price amount: ${d.amount}`)
        this.db.exec(
          `INSERT INTO directives_price
             (date, commodity, currency, amount, amount_scaled, scale, meta_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          dateInt,
          d.commodity,
          d.currency,
          d.amount,
          pr.scaled,
          pr.scale,
          meta,
          now,
          now,
        )
        return
      }
      case 'note':
        this.db.exec(
          `INSERT INTO directives_note (date, account, description, meta_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          dateInt,
          d.account,
          d.description,
          meta,
          now,
          now,
        )
        return
      case 'document':
        this.db.exec(
          `INSERT INTO directives_document (date, account, filename, meta_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          dateInt,
          d.account,
          d.filename,
          meta,
          now,
          now,
        )
        return
      case 'event':
        this.db.exec(
          `INSERT INTO directives_event (date, name, value, meta_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          dateInt,
          d.name,
          d.value,
          meta,
          now,
          now,
        )
        return
    }
  }

  private insertPosting(txnId: number, idx: number, p: PostingInput, dateInt: number): void {
    // parseJournalStrict rejects elided postings, so amount/currency are present.
    const amt = decimalToScaled(p.amount!)
    if (!amt) throw new Error(`unparseable amount: ${p.amount}`)
    const price = p.price_amount != null ? decimalToScaled(p.price_amount) : null
    this.db.exec(
      `INSERT INTO postings (
        txn_id, idx, flag, account,
        amount, amount_scaled, scale, currency,
        cost_raw,
        price_at_signs, price_amount, price_amount_scaled, price_scale, price_currency,
        comment, meta_json, date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      txnId,
      idx,
      p.flag ?? null,
      p.account,
      p.amount!,
      amt.scaled,
      amt.scale,
      p.currency!,
      p.cost_raw ?? null,
      p.price_at_signs ?? 0,
      p.price_amount ?? null,
      price ? price.scaled : null,
      price ? price.scale : null,
      p.price_currency ?? null,
      p.comment ?? null,
      JSON.stringify(p.meta ?? {}),
      dateInt,
    )
  }

  async list_account_entries(
    account: string,
    limit: number,
    offset: number,
  ): Promise<AccountEntriesResponse> {
    const totalRow = this.db
      .exec<{ c: number }>(
        `SELECT
          (SELECT COUNT(*) FROM transactions t
             WHERE t.id IN (SELECT p.txn_id FROM postings p WHERE p.account = ?))
        + (SELECT COUNT(*) FROM directives_open WHERE account = ?)
        + (SELECT COUNT(*) FROM directives_close WHERE account = ?)
        + (SELECT COUNT(*) FROM directives_balance WHERE account = ?)
        + (SELECT COUNT(*) FROM directives_pad WHERE account = ? OR account_pad = ?)
        + (SELECT COUNT(*) FROM directives_note WHERE account = ?)
        + (SELECT COUNT(*) FROM directives_document WHERE account = ?)
        AS c`,
        account,
        account,
        account,
        account,
        account,
        account,
        account,
        account,
      )
      .toArray()[0]
    const total = totalRow?.c ?? 0

    const cap = limit + offset
    const refs = this.collectRefs(account, cap).slice(offset, offset + limit)

    const entries: Entry[] = []
    for (const ref of refs) {
      const e = this.readEntry(ref)
      if (e) entries.push(e)
    }
    return { entries, total, limit, offset }
  }

  private collectRefs(account: string, cap: number): EntryRef[] {
    const txnRefs = this.db
      .exec<{ date: number; id: number }>(
        `SELECT t.date AS date, t.id AS id FROM transactions t
         WHERE t.id IN (SELECT p.txn_id FROM postings p WHERE p.account = ?)
         ORDER BY t.date DESC, t.id DESC
         LIMIT ?`,
        account,
        cap,
      )
      .toArray()
      .map((r) => ({ kind: 'txn' as const, id: r.id, date: r.date }))

    const directiveRefs = this.db
      .exec<{ date: number; kind: string; id: number }>(
        `SELECT date, kind, id FROM (
           SELECT date, 'open' AS kind, id FROM directives_open WHERE account = ?
           UNION ALL
           SELECT date, 'close' AS kind, id FROM directives_close WHERE account = ?
           UNION ALL
           SELECT date, 'balance' AS kind, id FROM directives_balance WHERE account = ?
           UNION ALL
           SELECT date, 'pad' AS kind, id FROM directives_pad
             WHERE account = ? OR account_pad = ?
           UNION ALL
           SELECT date, 'note' AS kind, id FROM directives_note WHERE account = ?
         )
         ORDER BY date DESC, kind ASC, id DESC
         LIMIT ?`,
        account,
        account,
        account,
        account,
        account,
        account,
        cap,
      )
      .toArray()
      .map((r) => ({ kind: r.kind as Entry['kind'], id: r.id, date: r.date }))

    const docRefs = this.db
      .exec<{ date: number; id: number }>(
        `SELECT date, id FROM directives_document WHERE account = ?
         ORDER BY date DESC, id DESC
         LIMIT ?`,
        account,
        cap,
      )
      .toArray()
      .map((r) => ({ kind: 'document' as const, id: r.id, date: r.date }))

    const merged = [...txnRefs, ...directiveRefs, ...docRefs]
    merged.sort((a, b) => {
      if (a.date !== b.date) return b.date - a.date
      if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1
      return b.id - a.id
    })
    return merged
  }

  private readEntry(ref: EntryRef): Entry | null {
    switch (ref.kind) {
      case 'txn':
        return this.readTxnEntry(ref.id)
      case 'open':
        return this.readOpenEntry(ref.id)
      case 'close':
        return this.readCloseEntry(ref.id)
      case 'balance':
        return this.readBalanceEntry(ref.id)
      case 'pad':
        return this.readPadEntry(ref.id)
      case 'note':
        return this.readNoteEntry(ref.id)
      case 'document':
        return this.readDocumentEntry(ref.id)
    }
  }

  private readTxnEntry(id: number): EntryTxn | null {
    const head = this.db
      .exec<{
        id: number
        date: number
        flag: string | null
        payee: string
        narration: string
        meta_json: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, flag, payee, narration, meta_json, created_at, updated_at
         FROM transactions WHERE id = ?`,
        id,
      )
      .toArray()[0]
    if (!head) return null
    const postingRows = this.db
      .exec<{
        idx: number
        flag: string | null
        account: string
        amount: string | null
        currency: string | null
        cost_raw: string | null
        price_at_signs: number
        price_amount: string | null
        price_currency: string | null
        comment: string | null
        meta_json: string
      }>(
        `SELECT idx, flag, account, amount, currency, cost_raw,
                price_at_signs, price_amount, price_currency, comment, meta_json
         FROM postings WHERE txn_id = ? ORDER BY idx ASC`,
        id,
      )
      .toArray()
    const postings: Posting[] = postingRows.map((r) => ({
      account: r.account,
      flag: r.flag,
      amount: r.amount,
      currency: r.currency,
      cost_raw: r.cost_raw,
      price_at_signs: (r.price_at_signs === 1 || r.price_at_signs === 2 ? r.price_at_signs : 0) as
        | 0
        | 1
        | 2,
      price_amount: r.price_amount,
      price_currency: r.price_currency,
      comment: r.comment,
      meta: parseMeta(r.meta_json),
    }))
    const tags = this.db
      .exec<{ tag: string }>(
        'SELECT tag FROM txn_tags WHERE txn_id = ? ORDER BY tag ASC',
        id,
      )
      .toArray()
      .map((r) => r.tag)
    const links = this.db
      .exec<{ link: string }>(
        'SELECT link FROM txn_links WHERE txn_id = ? ORDER BY link ASC',
        id,
      )
      .toArray()
      .map((r) => r.link)
    return {
      kind: 'txn',
      id: head.id,
      date: dateFromInt(head.date),
      flag: (head.flag === '*' || head.flag === '!' ? head.flag : null) as '*' | '!' | null,
      payee: head.payee,
      narration: head.narration,
      postings,
      tags,
      links,
      meta: parseMeta(head.meta_json),
      created_at: head.created_at,
      updated_at: head.updated_at,
    }
  }

  private readOpenEntry(id: number): EntryOpen | null {
    const row = this.db
      .exec<{
        id: number
        date: number
        account: string
        booking_method: string | null
        constraint_currencies: string
        meta_json: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, account, booking_method, constraint_currencies,
                meta_json, created_at, updated_at
         FROM directives_open WHERE id = ?`,
        id,
      )
      .toArray()[0]
    if (!row) return null
    return {
      kind: 'open',
      id: row.id,
      date: dateFromInt(row.date),
      account: row.account,
      booking_method: row.booking_method,
      constraint_currencies: parseStringArray(row.constraint_currencies),
      meta: parseMeta(row.meta_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  private readCloseEntry(id: number): EntryClose | null {
    const row = this.db
      .exec<{
        id: number
        date: number
        account: string
        meta_json: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, account, meta_json, created_at, updated_at
         FROM directives_close WHERE id = ?`,
        id,
      )
      .toArray()[0]
    if (!row) return null
    return {
      kind: 'close',
      id: row.id,
      date: dateFromInt(row.date),
      account: row.account,
      meta: parseMeta(row.meta_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  private readBalanceEntry(id: number): EntryBalance | null {
    const row = this.db
      .exec<{
        id: number
        date: number
        account: string
        amount: string
        currency: string
        meta_json: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, account, amount, currency, meta_json, created_at, updated_at
         FROM directives_balance WHERE id = ?`,
        id,
      )
      .toArray()[0]
    if (!row) return null
    return {
      kind: 'balance',
      id: row.id,
      date: dateFromInt(row.date),
      account: row.account,
      amount: row.amount,
      currency: row.currency,
      meta: parseMeta(row.meta_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  private readPadEntry(id: number): EntryPad | null {
    const row = this.db
      .exec<{
        id: number
        date: number
        account: string
        account_pad: string
        meta_json: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, account, account_pad, meta_json, created_at, updated_at
         FROM directives_pad WHERE id = ?`,
        id,
      )
      .toArray()[0]
    if (!row) return null
    return {
      kind: 'pad',
      id: row.id,
      date: dateFromInt(row.date),
      account: row.account,
      account_pad: row.account_pad,
      meta: parseMeta(row.meta_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  private readNoteEntry(id: number): EntryNote | null {
    const row = this.db
      .exec<{
        id: number
        date: number
        account: string
        description: string
        meta_json: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, account, description, meta_json, created_at, updated_at
         FROM directives_note WHERE id = ?`,
        id,
      )
      .toArray()[0]
    if (!row) return null
    return {
      kind: 'note',
      id: row.id,
      date: dateFromInt(row.date),
      account: row.account,
      description: row.description,
      meta: parseMeta(row.meta_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  private readDocumentEntry(id: number): EntryDocument | null {
    const row = this.db
      .exec<{
        id: number
        date: number
        account: string
        filename: string
        meta_json: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, account, filename, meta_json, created_at, updated_at
         FROM directives_document WHERE id = ?`,
        id,
      )
      .toArray()[0]
    if (!row) return null
    return {
      kind: 'document',
      id: row.id,
      date: dateFromInt(row.date),
      account: row.account,
      filename: row.filename,
      meta: parseMeta(row.meta_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }
}

function parseMetaOrNull(json: string): Record<string, string> | null {
  const m = parseMeta(json)
  return Object.keys(m).length > 0 ? m : null
}

function parseMeta(json: string): Record<string, string> {
  if (json === '{}' || json === '') return {}
  try {
    const parsed = JSON.parse(json) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') out[k] = v
      }
      return out
    }
  } catch {}
  return {}
}

function parseStringArray(json: string): string[] {
  if (json === '[]' || json === '') return []
  try {
    const parsed = JSON.parse(json) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === 'string')
    }
  } catch {}
  return []
}

function entryTxnToInput(e: EntryTxn): TransactionInput {
  return {
    date: e.date,
    flag: e.flag,
    payee: e.payee || undefined,
    narration: e.narration || undefined,
    postings: e.postings.map((p) => ({
      flag: p.flag,
      account: p.account,
      amount: p.amount,
      currency: p.currency,
      cost_raw: p.cost_raw,
      price_at_signs: p.price_at_signs,
      price_amount: p.price_amount,
      price_currency: p.price_currency,
      comment: p.comment,
      meta: Object.keys(p.meta).length ? p.meta : null,
    })),
    tags: e.tags,
    links: e.links,
    meta: Object.keys(e.meta).length ? e.meta : null,
  }
}
