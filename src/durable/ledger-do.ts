import { Think } from '@cloudflare/think'
import { createWorkersAI } from 'workers-ai-provider'
import { tool, type ToolSet } from 'ai'
import { buildSystemPrompt } from './agent-prompt'
import { clarifyInputSchema, draftTransactionSchema } from './agent-ui-schemas'
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
import { validateAccountShapes } from '@/lib/beancount/validate-account-shape'
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
  EntryTxn,
  Posting,
  PostingInput,
  TransactionInput,
} from './ledger-types'
import {
  POSTING_SEARCH_DEFAULT_LIMIT,
  POSTING_SEARCH_MAX_LIMIT,
  type PostingSearchFilter,
  type PostingSearchResponse,
  type PostingSearchRow,
} from '@/lib/ledger-core/posting-search'

// Order matters for clear(): we DELETE in this order. transactions first so
// the FK cascade tears down postings (which fires the materialized-balance
// triggers); the balance_totals / daily_balances entries at the end then
// flush any zero-rows the triggers left behind, so the DO comes back to a
// clean empty state.
const DATA_TABLES = [
  'transactions',
  'postings',
  'txn_tags',
  'txn_links',
  'directives_open',
  'directives_close',
  'directives_commodity',
  'directives_balance',
  'directives_price',
  'directives_note',
  'directives_document',
  'directives_event',
  'balance_totals',
  'daily_balances',
] as const

export type JournalGetResponse = { text: string }
export type JournalCursor = { date: string; id: number }
export type JournalGetFilteredRequest = {
  account?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  cursor?: JournalCursor | null
  limit?: number | null
}
export type JournalGetFilteredResponse = {
  text: string
  nextCursor: JournalCursor | null
}
export type JournalPutResponse = { text: string; inserted: number; deleted: number; unchanged: number }
export type JournalPutError = {
  ok: false
  error:
    | 'parse_error'
    | 'partial_parse'
    | 'unsupported_directives'
    | 'currency_lock'
    | 'credit_card_format'
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

function escapeBeancountString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function formatPosting(account: string, amount: number, currency: string): string {
  const padCol = 50
  const amountStr = amount.toFixed(2)
  const prefix = `  ${account}`
  const gap = Math.max(2, padCol - prefix.length - amountStr.length)
  return `${prefix}${' '.repeat(gap)}${amountStr} ${currency}`
}

export class LedgerDO extends Think {
  private db: SqlStorage

  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env)
    this.db = state.storage.sql
    this.migrate()
  }

  getModel() {
    const workersai = createWorkersAI({ binding: this.env.AI })
    // Kimi K2 emits a long reasoning trace by default. With a single
    // tool and unambiguous prompts, "low" effort is plenty and shaves
    // most of the per-turn latency.
    return workersai(MODEL_ID, { reasoning_effort: 'low' })
  }

  getSystemPrompt(): string {
    // Synchronous per the Think API. Build from the cached snapshot — Think
    // calls this on every turn, so we recompute fresh each time.
    const snapshot = this.ledger_snapshot_sync()
    return buildSystemPrompt(snapshot)
  }

  getTools(): ToolSet {
    return {
      draft_transaction: tool({
        description:
          'Propose a single beancount transaction for the user to review and approve. Use this whenever the user asks to record / add a transaction. Do NOT narrate the proposal in prose, do NOT invent file paths, do NOT pretend you have already written to the journal — just call this tool with the structured fields. The user sees an editable card and approves or rejects.',
        inputSchema: draftTransactionSchema,
        // No execute → client-side tool. The agent loop suspends until the
        // UI resolves it via addToolResult.
      }),
      clarify: tool({
        description:
          'Ask the user one short clarifying question when a required accounting choice is genuinely ambiguous (e.g. instant discount vs separately-redeemable cashback). Provide suggested `options` as short chips; set `multi_select: true` for "all that apply"; set `allow_custom: false` only when free text would not make sense. After the user answers, you will receive { answers: string[] } as the tool result — then proceed (typically to draft_transaction).',
        inputSchema: clarifyInputSchema,
        // Client-side — resolved by the user picking / typing.
      }),
    }
  }

  private migrate(): void {
    // Defense in depth: DO SQLite enables FK enforcement by default in current
    // workerd, but make it explicit so a future runtime change can't silently
    // turn it off and leave our REFERENCES + ON DELETE CASCADE decorative.
    this.db.exec('PRAGMA foreign_keys = ON')

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
    this.hardenPostings()
  }

  // One-time rebuild of legacy postings tables that were created before the
  // STRICT + NOT NULL + CHECK constraints were declared in schema.ts.
  // `CREATE TABLE IF NOT EXISTS` doesn't retro-enforce constraints on an
  // existing table, so a DO created off an older schema can keep accepting
  // rows that today's writers would never produce (elided amounts, empty
  // strings, sign-mismatched amount/amount_scaled, etc.).
  private hardenPostings(): void {
    const info = this.db
      .exec<{ name: string; notnull: number }>('PRAGMA table_info(postings)')
      .toArray()
    if (info.length === 0) return

    const required = ['amount', 'amount_scaled', 'scale', 'currency']
    const allNotNull = required.every(
      (col) => (info.find((r) => r.name === col)?.notnull ?? 0) === 1,
    )
    const master = this.db
      .exec<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='postings'",
      )
      .toArray()[0]
    const hasStrict = master?.sql?.includes('STRICT') ?? false
    const hasChecks = master?.sql?.includes('CHECK') ?? false
    if (allNotNull && hasStrict && hasChecks) return

    // Cleanup from any half-finished prior attempt.
    this.db.exec('DROP TABLE IF EXISTS postings_v2')

    // Drop rows the new constraints would reject. Logged loudly so a
    // surprise data loss is visible in observability.
    const reject = [
      ...required.map((c) => `${c} IS NULL`),
      "length(account) = 0",
      "length(amount) = 0",
      "length(currency) = 0",
      "scale < 0 OR scale > 18",
      "date < 19000101 OR date > 21001231",
      "amount_scaled != 0 AND (substr(amount, 1, 1) = '-') != (amount_scaled < 0)",
    ].join(' OR ')
    const bad =
      this.db
        .exec<{ n: number }>(`SELECT COUNT(*) AS n FROM postings WHERE ${reject}`)
        .toArray()[0]?.n ?? 0
    if (bad > 0) {
      console.warn(
        `[harden_postings] dropping ${bad} row(s) that violate the new STRICT/CHECK constraints`,
      )
      this.db.exec(`DELETE FROM postings WHERE ${reject}`)
    }

    this.db.exec(`CREATE TABLE postings_v2 (
      txn_id              INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      idx                 INTEGER NOT NULL,
      flag                TEXT,
      account             TEXT    NOT NULL CHECK (length(account) > 0),
      amount              TEXT    NOT NULL CHECK (length(amount) > 0),
      amount_scaled       INTEGER NOT NULL,
      scale               INTEGER NOT NULL CHECK (scale >= 0 AND scale <= 18),
      currency            TEXT    NOT NULL CHECK (length(currency) > 0),
      cost_raw            TEXT,
      price_at_signs      INTEGER NOT NULL DEFAULT 0,
      price_amount        TEXT,
      price_amount_scaled INTEGER,
      price_scale         INTEGER,
      price_currency      TEXT,
      comment             TEXT,
      meta_json           TEXT NOT NULL DEFAULT '{}',
      date                INTEGER NOT NULL CHECK (date >= 19000101 AND date <= 21001231),
      PRIMARY KEY (txn_id, idx),
      CHECK (amount_scaled = 0 OR (substr(amount, 1, 1) = '-') = (amount_scaled < 0))
    ) STRICT`)
    this.db.exec(`INSERT INTO postings_v2 (
      txn_id, idx, flag, account, amount, amount_scaled, scale, currency,
      cost_raw, price_at_signs, price_amount, price_amount_scaled,
      price_scale, price_currency, comment, meta_json, date
    ) SELECT
      txn_id, idx, flag, account, amount, amount_scaled, scale, currency,
      cost_raw, price_at_signs, price_amount, price_amount_scaled,
      price_scale, price_currency, comment, meta_json, date
    FROM postings`)
    this.db.exec('DROP INDEX IF EXISTS idx_postings_account_date')
    this.db.exec('DROP INDEX IF EXISTS idx_postings_currency_date')
    this.db.exec('DROP TABLE postings')
    this.db.exec('ALTER TABLE postings_v2 RENAME TO postings')
    this.db.exec(
      'CREATE INDEX idx_postings_account_date ON postings(account, date, txn_id, idx)',
    )
    this.db.exec(
      'CREATE INDEX idx_postings_currency_date ON postings(currency, date)',
    )
    console.log('[harden_postings] rebuilt postings table with STRICT + NOT NULL + CHECK')
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
    return { text: serializeJournal(transactions, directives, { descending: true }) }
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
    return { text: serializeJournal(transactions, directives, { descending: true }) }
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
    return { text: serializeJournal(transactions, directives, { descending: true }) }
  }

  async journal_get_filtered(
    req: JournalGetFilteredRequest,
  ): Promise<JournalGetFilteredResponse> {
    const PAGE_DEFAULT = 200
    const PAGE_MAX = 500
    const account =
      typeof req.account === 'string' && req.account.length > 0 ? req.account : null
    const fromInt = req.dateFrom ? dateToInt(req.dateFrom) : null
    const toInt = req.dateTo ? dateToInt(req.dateTo) : null
    const cursor =
      req.cursor && typeof req.cursor.date === 'string' && Number.isFinite(req.cursor.id)
        ? { date: dateToInt(req.cursor.date), id: req.cursor.id }
        : null
    const limit = Math.min(
      PAGE_MAX,
      Math.max(1, Math.floor(req.limit ?? PAGE_DEFAULT)),
    )

    const wheres: string[] = []
    const binds: unknown[] = []
    if (account) {
      wheres.push(
        `id IN (SELECT txn_id FROM postings WHERE account = ? OR account GLOB ?)`,
      )
      binds.push(account, account + ':*')
    }
    if (fromInt != null) {
      wheres.push('date >= ?')
      binds.push(fromInt)
    }
    if (toInt != null) {
      wheres.push('date <= ?')
      binds.push(toInt)
    }
    if (cursor) {
      wheres.push('(date < ? OR (date = ? AND id < ?))')
      binds.push(cursor.date, cursor.date, cursor.id)
    }
    const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : ''
    const rows = this.db
      .exec<{ id: number; date: number }>(
        `SELECT id, date FROM transactions
         ${whereClause}
         ORDER BY date DESC, id DESC
         LIMIT ?`,
        ...binds,
        limit + 1,
      )
      .toArray()
    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const transactions: TransactionInput[] = []
    for (const r of pageRows) {
      const e = this.readTxnEntry(r.id)
      if (e) transactions.push(entryTxnToInput(e))
    }
    const last = pageRows[pageRows.length - 1]
    const nextCursor: JournalCursor | null = hasMore && last
      ? { date: dateFromInt(last.date), id: last.id }
      : null

    // Directives included only on the first page (cursor==null). They're
    // typically sparse (open/close/balance/note) and filtering by date+account
    // keeps the payload small.
    let directives = cursor ? [] : this.readAllDirectives()
    if (!cursor) {
      if (account) directives = directives.filter((d) => directiveTouchesAccount(d, account))
      if (fromInt != null) directives = directives.filter((d) => dateToInt(d.date) >= fromInt)
      if (toInt != null) directives = directives.filter((d) => dateToInt(d.date) <= toInt)
    }
    return {
      text: serializeJournal(transactions, directives, { descending: true }),
      nextCursor,
    }
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
    collect(
      `SELECT plug_account AS account FROM directives_balance WHERE plug_account GLOB ?`,
      glob,
    )
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

  async search_postings(filter: PostingSearchFilter): Promise<PostingSearchResponse> {
    const limit = Math.min(
      filter.limit ?? POSTING_SEARCH_DEFAULT_LIMIT,
      POSTING_SEARCH_MAX_LIMIT,
    )
    const wheres: string[] = []
    const binds: unknown[] = []

    if (filter.date?.from) {
      wheres.push('p.date >= ?')
      binds.push(dateToInt(filter.date.from))
    }
    if (filter.date?.to) {
      wheres.push('p.date < ?')
      binds.push(dateToInt(filter.date.to))
    }

    const acctOr: string[] = []
    for (const a of filter.accounts?.exact ?? []) {
      acctOr.push('p.account = ?')
      binds.push(a)
    }
    for (const p of filter.accounts?.prefix ?? []) {
      acctOr.push('(p.account = ? OR p.account GLOB ?)')
      binds.push(p, p + ':*')
    }
    if (acctOr.length) wheres.push('(' + acctOr.join(' OR ') + ')')

    if (filter.currencies?.length) {
      wheres.push(
        `p.currency IN (${filter.currencies.map(() => '?').join(',')})`,
      )
      binds.push(...filter.currencies)
    }

    if (filter.amount?.signed?.gte != null) {
      wheres.push('CAST(p.amount AS REAL) >= ?')
      binds.push(filter.amount.signed.gte)
    }
    if (filter.amount?.signed?.lte != null) {
      wheres.push('CAST(p.amount AS REAL) <= ?')
      binds.push(filter.amount.signed.lte)
    }

    if (filter.sign === 'debit') wheres.push('p.amount_scaled < 0')
    if (filter.sign === 'credit') wheres.push('p.amount_scaled > 0')

    if (filter.payee_q) {
      wheres.push('(t.payee LIKE ? OR t.narration LIKE ?)')
      const q = `%${filter.payee_q}%`
      binds.push(q, q)
    }

    if (filter.flag) {
      wheres.push('t.flag = ?')
      binds.push(filter.flag)
    }

    const whereSql = wheres.length ? 'WHERE ' + wheres.join(' AND ') : ''
    const probe = limit + 1
    const sql = `
      SELECT p.txn_id, p.idx, p.date, t.flag, t.payee, t.narration,
             p.account, p.amount, p.currency
      FROM postings p
      JOIN transactions t ON t.id = p.txn_id
      ${whereSql}
      ORDER BY p.date DESC, p.txn_id DESC, p.idx ASC
      LIMIT ?
    `
    const raw = this.db
      .exec<{
        txn_id: number
        idx: number
        date: number
        flag: string | null
        payee: string
        narration: string
        account: string
        amount: string
        currency: string
      }>(sql, ...binds, probe)
      .toArray()

    const truncated = raw.length > limit
    const sliced = truncated ? raw.slice(0, limit) : raw
    const rows: PostingSearchRow[] = sliced.map((r) => ({
      txn_id: r.txn_id,
      idx: r.idx,
      date: dateFromInt(r.date),
      flag: r.flag === '*' || r.flag === '!' ? r.flag : null,
      payee: r.payee,
      narration: r.narration,
      account: r.account,
      amount: r.amount,
      currency: r.currency,
    }))
    return { rows, truncated, limit }
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
    // Hold the input gate across the diff (async, has await points) and the
    // apply (sync transactionSync) so concurrent puts can't race the read
    // phase and end up applying a stale plan.
    return this.ctx.blockConcurrencyWhile(async () => {
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
    })
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
    const survivingText = serializeJournal(surviving, directives, { descending: true })
    const beforeText = targeted.length > 0 ? serializeJournal(targeted, [], { descending: true }) : ''
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

  async commit_ingest(opts: {
    account: string
    currency: string
    source_filename?: string
    rows: ReadonlyArray<{
      date: string
      amount: number
      payee: string
      narration?: string
      counterparty: string
      tags?: ReadonlyArray<string>
    }>
  }): Promise<ProposeJournalEditResponse> {
    const ccy = opts.currency
    const blocks: string[] = []
    for (const r of opts.rows) {
      const tagSuffix = r.tags && r.tags.length > 0
        ? ' ' + r.tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')
        : ''
      const narrationField = r.narration ? ` "${escapeBeancountString(r.narration)}"` : ''
      const header = `${r.date} * "${escapeBeancountString(r.payee)}"${narrationField}${tagSuffix}`
      const acctSide = formatPosting(opts.account, r.amount, ccy)
      const otherSide = formatPosting(r.counterparty, -r.amount, ccy)
      blocks.push(`${header}\n${acctSide}\n${otherSide}`)
    }
    const proposed_text = blocks.join('\n\n')
    const instruction = opts.source_filename
      ? `Ingest ${opts.rows.length} txns from ${opts.source_filename} into ${opts.account}`
      : `Ingest ${opts.rows.length} txns into ${opts.account}`
    return this.propose_journal_edit({
      instruction,
      proposed_text,
    })
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

    const shapeIssues = validateAccountShapes(parsed.transactions, parsed.directives)
    if (shapeIssues.length > 0) {
      return {
        ok: false,
        error: 'credit_card_format',
        message: shapeIssues.map((i) => i.message).join('; '),
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

  // Compare materialized balance tables against a fresh GROUP BY of postings.
  // Returns the rows that disagree — empty array means the triggers have
  // kept everything in sync. Cheap enough to call after every test write.
  async verify_balances(): Promise<{
    totals_drift: Array<{
      account: string
      currency: string
      scale: number
      stored: number
      expected: number
    }>
    daily_drift: Array<{
      account: string
      currency: string
      scale: number
      date: number
      stored: number
      expected: number
    }>
  }> {
    const totalsDrift = this.db
      .exec<{
        account: string
        currency: string
        scale: number
        stored: number
        expected: number
      }>(
        `WITH expected AS (
           SELECT account, currency, scale, SUM(amount_scaled) AS s
           FROM postings GROUP BY account, currency, scale
         )
         SELECT b.account, b.currency, b.scale,
                b.balance_scaled AS stored,
                COALESCE(e.s, 0) AS expected
         FROM balance_totals b
         LEFT JOIN expected e
           ON b.account = e.account AND b.currency = e.currency AND b.scale = e.scale
         WHERE b.balance_scaled != COALESCE(e.s, 0)
         UNION ALL
         SELECT e.account, e.currency, e.scale,
                0 AS stored,
                e.s AS expected
         FROM expected e
         LEFT JOIN balance_totals b
           ON b.account = e.account AND b.currency = e.currency AND b.scale = e.scale
         WHERE b.account IS NULL`,
      )
      .toArray()

    const dailyDrift = this.db
      .exec<{
        account: string
        currency: string
        scale: number
        date: number
        stored: number
        expected: number
      }>(
        `WITH daily_deltas AS (
           SELECT account, currency, scale, date,
                  SUM(amount_scaled) AS d
           FROM postings
           GROUP BY account, currency, scale, date
         ),
         expected AS (
           SELECT account, currency, scale, date,
                  SUM(d) OVER (
                    PARTITION BY account, currency, scale
                    ORDER BY date
                  ) AS s
           FROM daily_deltas
         )
         SELECT d.account, d.currency, d.scale, d.date,
                d.balance_scaled AS stored,
                COALESCE(e.s, 0) AS expected
         FROM daily_balances d
         LEFT JOIN expected e
           ON d.account = e.account AND d.currency = e.currency
              AND d.scale = e.scale AND d.date = e.date
         WHERE d.balance_scaled != COALESCE(e.s, 0)
         UNION ALL
         SELECT e.account, e.currency, e.scale, e.date,
                0 AS stored,
                e.s AS expected
         FROM expected e
         LEFT JOIN daily_balances d
           ON d.account = e.account AND d.currency = e.currency
              AND d.scale = e.scale AND d.date = e.date
         WHERE d.account IS NULL`,
      )
      .toArray()

    return { totals_drift: totalsDrift, daily_drift: dailyDrift }
  }

  // Wipe + re-derive both tables from postings. Same SQL as the backfill
  // SCHEMA_STEPS, exposed as an admin escape hatch in case the triggers ever
  // drift in production.
  async rebuild_balances(): Promise<{ ok: true }> {
    this.ctx.storage.transactionSync(() => {
      this.db.exec('DELETE FROM balance_totals')
      this.db.exec(
        `INSERT INTO balance_totals (account, currency, scale, balance_scaled)
         SELECT account, currency, scale, SUM(amount_scaled)
         FROM postings
         GROUP BY account, currency, scale`,
      )
      this.db.exec('DELETE FROM daily_balances')
      this.db.exec(
        `INSERT INTO daily_balances (account, currency, scale, date, balance_scaled)
         SELECT account, currency, scale, date,
                SUM(daily_delta) OVER (
                  PARTITION BY account, currency, scale
                  ORDER BY date
                )
         FROM (
           SELECT account, currency, scale, date,
                  SUM(amount_scaled) AS daily_delta
           FROM postings
           GROUP BY account, currency, scale, date
         )`,
      )
    })
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

  // Admin SQL — writes allowed. Caller (admin/sql route) gates by allowlist.
  // Distinct from query_sql so the AI agent's tool stays read-only.
  async exec_sql(
    sql: string,
    params: ReadonlyArray<string | number | null> = [],
  ): Promise<{
    columns: string[]
    rows: Array<Record<string, unknown>>
    truncated: boolean
    rows_written: number
  }> {
    const MAX_ROWS = 1000
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
    return { columns, rows, truncated, rows_written: cursor.rowsWritten }
  }

  // Lightweight, per-turn ledger snapshot for the agent's context window.
  async ledger_snapshot(): Promise<{
    today: number
    accounts: Array<{ account: string; currencies: string[]; open_date: number; close_date: number | null }>
    row_counts: Record<string, number>
    sample_txns: string
    schema_ddl: string
  }> {
    return this.ledger_snapshot_sync()
  }

  ledger_snapshot_sync(): {
    today: number
    accounts: Array<{ account: string; currencies: string[]; open_date: number; close_date: number | null }>
    row_counts: Record<string, number>
    sample_txns: string
    schema_ddl: string
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

    const ddlRows = this.db
      .exec<{ sql: string | null }>(
        `SELECT sql FROM sqlite_master
         WHERE type IN ('table','index')
           AND name NOT LIKE 'sqlite_%'
           AND sql IS NOT NULL
         ORDER BY type DESC, name`,
      )
      .toArray()
    const schema_ddl = ddlRows
      .map((r) => r.sql!.trim())
      .filter(Boolean)
      .join(';\n\n') + ';'

    return { today, accounts: accountList, row_counts: counts, sample_txns, schema_ddl }
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
            plug_account: string | null
            meta_json: string
          }>(
            'SELECT id, date, account, amount, currency, plug_account, meta_json FROM directives_balance',
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
              plug_account: r.plug_account,
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
             (date, account, amount, amount_scaled, scale, currency, plug_account, meta_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          dateInt,
          d.account,
          d.amount,
          bal.scaled,
          bal.scale,
          d.currency,
          d.plug_account ?? null,
          meta,
          now,
          now,
        )
        return
      }
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
        + (SELECT COUNT(*) FROM directives_balance WHERE account = ? OR plug_account = ?)
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
           SELECT date, 'balance' AS kind, id FROM directives_balance
             WHERE account = ? OR plug_account = ?
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
        plug_account: string | null
        meta_json: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, account, amount, currency, plug_account, meta_json, created_at, updated_at
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
      plug_account: row.plug_account,
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
