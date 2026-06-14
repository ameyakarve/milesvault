import { DurableObject } from 'cloudflare:workers'
import { SCHEMA_STEPS } from '@/lib/ledger-core/schema'
import {
  dateFromInt,
  dateToInt,
  serializeJournal,
  transactionInputHash,
} from '@/lib/beancount/ast'
import { isStrictParseErr, parseJournalStrict } from '@/lib/beancount/parse-strict'
import { validateAccountCurrencies } from '@/lib/beancount/validate-currency'
import { validateAccountShapes } from '@/lib/beancount/validate-account-shape'
import { validateBatchBalance } from '@/lib/beancount/validate-balance'
import { decimalToScaled } from '@/lib/beancount/decimal'
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
  EntryKind,
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
  'capture_items',
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
export type JournalPutError = {
  ok: false
  error:
    | 'parse_error'
    | 'partial_parse'
    | 'unsupported_directives'
    | 'currency_lock'
    | 'credit_card_format'
    | 'unbalanced'
    | 'balance_assertion_failed'
  message: string
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
  | {
      ok: true
      proposal_id: string
      text: string
      inserted: number
      deleted: number
      unchanged: number
    }
  | JournalPutError
  | { ok: false; error: 'no_such_proposal' | 'already_resolved'; message: string }

export type { EntryKind } from './ledger-types'

export type EntryRow = {
  kind: EntryKind
  id: number
  raw_text: string
  updated_at: number
}

export type ListEntriesResponse = { rows: EntryRow[] }

export type EntryRef2 = {
  kind: EntryKind
  id: number
  expected_updated_at: number
}

// Headline numbers for the Vault home (owner ask): per-currency aggregates
// that are actually meaningful — what you owe on cards, what you spent this
// period and on what, what's in the bank. Points balances live on the hero
// cards, never summed across currencies.
export type VaultStats = {
  period: { from: number; to: number }
  card_outstanding: Array<{ currency: string; total: number; accounts: number }>
  // Per-card charges (negative postings on the liability). Window: between
  // the card's two most recent balance assertions (= the imported statement
  // cycle) when they exist, else the stats period (month-to-date).
  card_spend: Array<{ account: string; currency: string; total: number }>
  bank_total: Array<{ currency: string; total: number }>
  expense_total: Array<{ currency: string; total: number }>
  expense_categories: Array<{ category: string; currency: string; total: number }>
}

// Data for the per-account overview tab (docs/design/overview-tab.md):
// KPIs, balance series, counterpart composition, notable transactions —
// one currency at a time, all decimal-converted.
export type AccountOverview = {
  account: string
  currencies: string[]
  currency: string | null
  current: number
  period: { from: number; to: number }
  inflow: number
  outflow: number
  txn_count: number
  series: Array<{ date: number; balance: number }>
  monthly: Array<{ month: number; net: number }>
  composition: Array<{ account: string; total: number }>
  notable: Array<{ date: number; payee: string; narration: string; amount: number }>
}

export type EmailRule = {
  id: number
  from_match: string | null
  subject_match: string | null
  action: string
  prompt: string | null
  enabled: number
  created_at: number
}

export type ReplaceBufferRequest = {
  knownIds: EntryRef2[]
  buffer: string
}

export type ReplaceBufferConflict = {
  ok: false
  error: 'occ_conflict'
  conflictingIds: Array<{
    kind: EntryKind
    id: number
    current_updated_at: number | null
  }>
}

export type ReplaceBufferResponse =
  | { ok: true; rows: EntryRow[] }
  | JournalPutError
  | ReplaceBufferConflict

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

// Pure storage Durable Object: the per-user SQLite ledger + its RPC API +
// transient statement-blob storage. The chat/agent runtime lives in a separate
// ChatDO (extends Think) that reads from here over RPC; this class holds no
// conversation state and no agent code.
export class LedgerDO extends DurableObject<Cloudflare.Env> {
  private db: SqlStorage

  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env)
    this.db = state.storage.sql
    this.migrate()
  }

  // ---- Statement-blob storage ----
  //
  // POST /api/statements stashes extracted PDF text here keyed by a minted
  // STMT-<uuid>; ChatDO's read_statement tool reads it back over RPC. The DO is
  // keyed per-user, so ownership is scoped by routing.

  async put_statement(opts: {
    id: string
    ownerEmail: string
    filename: string
    text: string
    // Page images (data URLs) for the vision extraction path; empty for
    // email/text-only arrivals.
    images?: string[]
    // Where the statement arrived from (ledger-pipeline.md §2). 'upload' is
    // the in-app paperclip/drop flow; 'email' is the ingest+token@ worker.
    source?: 'upload' | 'email'
    // Set by a matched email rule (experience.md §9): the instruction the
    // chat uses when this capture is reviewed.
    prompt?: string | null
    // Create an Inbox capture row (async ingestion). Email arrivals always
    // capture; uploads capture only when the client asks (global drop —
    // the chat paperclip is interactive and stays out of the Inbox).
    capture?: boolean
  }): Promise<{ ok: true }> {
    const now = Date.now()
    const source = opts.source ?? 'upload'
    this.ctx.storage.transactionSync(() => {
      this.db.exec(
        `INSERT OR REPLACE INTO statements (id, owner_email, filename, text, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        opts.id,
        opts.ownerEmail,
        opts.filename,
        opts.text,
        now,
      )
      // Page images, one row each (per-value size cap). Skip any single
      // image still over the limit rather than failing the whole write.
      this.db.exec('DELETE FROM statement_images WHERE statement_id = ?', opts.id)
      let idx = 0
      for (const url of opts.images ?? []) {
        if (url.length > 1_900_000) continue
        this.db.exec(
          'INSERT OR REPLACE INTO statement_images (statement_id, idx, data_url) VALUES (?, ?, ?)',
          opts.id,
          idx++,
          url,
        )
      }
      // Async arrivals become Inbox captures: forwarded email always, an
      // upload when the client opted in (global drop). The chat paperclip
      // is interactive and never enters the Inbox.
      if (source === 'email' || opts.capture) {
        this.db.exec(
          `INSERT OR REPLACE INTO capture_items (id, source, artifact, filename, state, prompt, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'captured', ?, ?, ?)`,
          opts.id,
          source,
          `stmt:${opts.id}`,
          opts.filename,
          opts.prompt ?? null,
          now,
          now,
        )
      }
    })
    return { ok: true }
  }

  async vault_stats(opts: { fromInt: number; toInt: number }): Promise<VaultStats> {
    const toDec = (scaled: number, scale: number) => scaled / 10 ** scale

    const sumByCurrency = (prefix: string) => {
      const rows = this.db
        .exec<{ currency: string; scale: number; s: number; n: number }>(
          `SELECT currency, scale, SUM(balance_scaled) AS s, COUNT(DISTINCT account) AS n
           FROM balance_totals WHERE account LIKE ? GROUP BY currency, scale`,
          `${prefix}%`,
        )
        .toArray()
      const byCcy = new Map<string, { total: number; accounts: number }>()
      for (const r of rows) {
        const cur = byCcy.get(r.currency) ?? { total: 0, accounts: 0 }
        cur.total += toDec(r.s, r.scale)
        cur.accounts = Math.max(cur.accounts, r.n)
        byCcy.set(r.currency, cur)
      }
      return [...byCcy.entries()].map(([currency, v]) => ({ currency, ...v }))
    }

    const card_outstanding = sumByCurrency('Liabilities:CreditCards:').sort(
      (a, b) => Math.abs(b.total) - Math.abs(a.total),
    )
    const bank_total = sumByCurrency('Assets:Bank:')
      .map(({ currency, total }) => ({ currency, total }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))

    // Period spending by category — Expenses:<Category> second segment;
    // Expenses:Void is the system plug (expiry/forfeit), not user spending.
    const expRows = this.db
      .exec<{ account: string; currency: string; scale: number; s: number }>(
        `SELECT account, currency, scale, SUM(amount_scaled) AS s
         FROM postings
         WHERE account LIKE 'Expenses:%' AND account NOT LIKE 'Expenses:Void%'
           AND date >= ? AND date <= ?
         GROUP BY account, currency, scale`,
        opts.fromInt,
        opts.toInt,
      )
      .toArray()
    const catMap = new Map<string, number>() // `${category}|${currency}`
    const totalMap = new Map<string, number>()
    for (const r of expRows) {
      const category = r.account.split(':')[1] ?? 'Misc'
      const v = toDec(r.s, r.scale)
      const key = `${category}|${r.currency}`
      catMap.set(key, (catMap.get(key) ?? 0) + v)
      totalMap.set(r.currency, (totalMap.get(r.currency) ?? 0) + v)
    }
    const cardAccounts = this.db
      .exec<{ account: string }>(
        `SELECT DISTINCT account FROM postings WHERE account LIKE 'Liabilities:CreditCards:%'`,
      )
      .toArray()
      .map((r) => r.account)
    const card_spend: Array<{
      account: string
      currency: string
      total: number
    }> = []
    // Charges in the trailing 90 days (owner call: a plain rolling window,
    // not the vague 'last statement'). toInt is YYYYMMDD; subtract 90 days.
    const toDate = new Date(
      Date.UTC(
        Math.floor(opts.toInt / 10000),
        Math.floor((opts.toInt % 10000) / 100) - 1,
        opts.toInt % 100,
      ),
    )
    const fromDate = new Date(toDate.getTime() - 90 * 86400000)
    const fromInt =
      fromDate.getUTCFullYear() * 10000 +
      (fromDate.getUTCMonth() + 1) * 100 +
      fromDate.getUTCDate()
    for (const account of cardAccounts) {
      const sums = new Map<string, number>()
      for (const r of this.db
        .exec<{ currency: string; scale: number; s: number | null }>(
          `SELECT currency, scale, SUM(-amount_scaled) AS s
           FROM postings
           WHERE account = ? AND amount_scaled < 0 AND date >= ? AND date <= ?
           GROUP BY currency, scale`,
          account,
          fromInt,
          opts.toInt,
        )
        .toArray()) {
        sums.set(r.currency, (sums.get(r.currency) ?? 0) + toDec(r.s ?? 0, r.scale))
      }
      if (sums.size === 0) sums.set('INR', 0)
      for (const [currency, total] of sums) {
        card_spend.push({ account, currency, total })
      }
    }

    const expense_categories = [...catMap.entries()]
      .map(([key, total]) => {
        const [category, currency] = key.split('|')
        return { category, currency, total }
      })
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    const expense_total = [...totalMap.entries()]
      .map(([currency, total]) => ({ currency, total }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))

    return {
      period: { from: opts.fromInt, to: opts.toInt },
      card_outstanding,
      card_spend,
      bank_total,
      expense_total,
      expense_categories,
    }
  }

  // Per-account FLOW totals over a date range under one root (Expenses, Income,
  // …), full account paths, by currency — the accounts-explorer treemap builds
  // its hierarchy from these. Same source as account_overview's category
  // roll-up, just not collapsed. Excludes the root's :Void plug.
  async account_flows(
    root: string,
    fromInt: number,
    toInt: number,
  ): Promise<Array<{ account: string; currency: string; total: number }>> {
    const toDec = (scaled: number, scale: number) => scaled / 10 ** scale
    const rows = this.db
      .exec<{ account: string; currency: string; scale: number; s: number }>(
        `SELECT account, currency, scale, SUM(amount_scaled) AS s
         FROM postings
         WHERE account LIKE ? AND account NOT LIKE ?
           AND date >= ? AND date <= ?
         GROUP BY account, currency, scale`,
        `${root}:%`,
        `${root}:Void%`,
        fromInt,
        toInt,
      )
      .toArray()
    // Collapse the per-scale rows into one total per (account, currency).
    const map = new Map<string, number>()
    for (const r of rows) {
      const key = `${r.account} ${r.currency}`
      map.set(key, (map.get(key) ?? 0) + toDec(r.s, r.scale))
    }
    const out: Array<{ account: string; currency: string; total: number }> = []
    for (const [key, total] of map) {
      if (total === 0) continue
      const [account, currency] = key.split(' ')
      out.push({ account: account!, currency: currency!, total })
    }
    return out
  }

  // The overview tab's data (docs/design/overview-tab.md). Balance math
  // stays in integer space per (currency, scale) until the end — balances
  // are materialized per scale and mixing them in SQL would corrupt sums.
  // Series is reconstructed backward from the CURRENT balance minus window
  // deltas, so it is exact for windows ending today (the only windows the
  // chips produce).
  async account_overview(opts: {
    account: string
    currency?: string | null
    fromInt: number
    toInt: number
  }): Promise<AccountOverview> {
    const { account, fromInt, toInt } = opts
    const currencies = this.db
      .exec<{ currency: string }>(
        `SELECT DISTINCT currency FROM postings WHERE account = ? ORDER BY currency`,
        account,
      )
      .toArray()
      .map((r) => r.currency)
    const currency =
      opts.currency && currencies.includes(opts.currency) ? opts.currency : (currencies[0] ?? null)
    const empty: AccountOverview = {
      account,
      currencies,
      currency,
      current: 0,
      period: { from: fromInt, to: toInt },
      inflow: 0,
      outflow: 0,
      txn_count: 0,
      series: [],
      monthly: [],
      composition: [],
      notable: [],
    }
    if (!currency) return empty

    const toDec = (scaled: number, scale: number) => scaled / 10 ** scale

    // Current balance, per scale.
    const curByScale = new Map<number, number>()
    for (const r of this.db
      .exec<{ scale: number; balance_scaled: number }>(
        `SELECT scale, balance_scaled FROM balance_totals WHERE account = ? AND currency = ?`,
        account,
        currency,
      )
      .toArray()) {
      curByScale.set(r.scale, r.balance_scaled)
    }
    const current = [...curByScale.entries()].reduce((sum, [sc, v]) => sum + toDec(v, sc), 0)

    // Window deltas per (date, scale) — feeds series, monthly and KPIs.
    const deltas = this.db
      .exec<{ date: number; scale: number; pos: number; neg: number }>(
        `SELECT date, scale,
                SUM(CASE WHEN amount_scaled > 0 THEN amount_scaled ELSE 0 END) AS pos,
                SUM(CASE WHEN amount_scaled < 0 THEN amount_scaled ELSE 0 END) AS neg
         FROM postings
         WHERE account = ? AND currency = ? AND date >= ? AND date <= ?
         GROUP BY date, scale ORDER BY date ASC`,
        account,
        currency,
        fromInt,
        toInt,
      )
      .toArray()

    let inflow = 0
    let outflow = 0
    const windowSumByScale = new Map<number, number>()
    const byDate = new Map<number, Map<number, number>>()
    const monthlyMap = new Map<number, number>()
    for (const d of deltas) {
      inflow += toDec(d.pos, d.scale)
      outflow += toDec(-d.neg, d.scale)
      const net = d.pos + d.neg
      windowSumByScale.set(d.scale, (windowSumByScale.get(d.scale) ?? 0) + net)
      let m = byDate.get(d.date)
      if (!m) byDate.set(d.date, (m = new Map()))
      m.set(d.scale, (m.get(d.scale) ?? 0) + net)
      const month = Math.floor(d.date / 100)
      monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + toDec(net, d.scale))
    }

    // Walk forward from the reconstructed window-start balance.
    const runByScale = new Map<number, number>()
    const scales = new Set<number>([...curByScale.keys(), ...windowSumByScale.keys()])
    for (const sc of scales) {
      runByScale.set(sc, (curByScale.get(sc) ?? 0) - (windowSumByScale.get(sc) ?? 0))
    }
    const startBalance = [...runByScale.entries()].reduce((sum, [sc, v]) => sum + toDec(v, sc), 0)
    const series: Array<{ date: number; balance: number }> = [
      { date: fromInt, balance: startBalance },
    ]
    for (const [date, perScale] of [...byDate.entries()].sort((a, b) => a[0] - b[0])) {
      for (const [sc, net] of perScale) runByScale.set(sc, (runByScale.get(sc) ?? 0) + net)
      series.push({
        date,
        balance: [...runByScale.entries()].reduce((sum, [sc, v]) => sum + toDec(v, sc), 0),
      })
    }

    const txn_count =
      this.db
        .exec<{ n: number }>(
          `SELECT COUNT(DISTINCT txn_id) AS n FROM postings
           WHERE account = ? AND currency = ? AND date >= ? AND date <= ?`,
          account,
          currency,
          fromInt,
          toInt,
        )
        .toArray()[0]?.n ?? 0

    // Composition: where the flow went/came from — counterpart legs of the
    // transactions touching this account, same currency, by their own sums.
    const compRows = this.db
      .exec<{ cp: string; scale: number; s: number }>(
        `SELECT p2.account AS cp, p2.scale AS scale, SUM(p2.amount_scaled) AS s
         FROM postings p1
         JOIN postings p2 ON p2.txn_id = p1.txn_id AND p2.account != p1.account
         WHERE p1.account = ? AND p1.currency = ? AND p2.currency = ?
           AND p1.date >= ? AND p1.date <= ?
         GROUP BY p2.account, p2.scale`,
        account,
        currency,
        currency,
        fromInt,
        toInt,
      )
      .toArray()
    const compMap = new Map<string, number>()
    for (const r of compRows) compMap.set(r.cp, (compMap.get(r.cp) ?? 0) + toDec(r.s, r.scale))
    const composition = [...compMap.entries()]
      .map(([acct, total]) => ({ account: acct, total }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
      .slice(0, 8)

    const notableRows = this.db
      .exec<{ date: number; payee: string; narration: string; amount_scaled: number; scale: number }>(
        `SELECT t.date AS date, t.payee AS payee, t.narration AS narration,
                p.amount_scaled AS amount_scaled, p.scale AS scale
         FROM postings p JOIN transactions t ON t.id = p.txn_id
         WHERE p.account = ? AND p.currency = ? AND p.date >= ? AND p.date <= ?
         ORDER BY ABS(p.amount_scaled) DESC LIMIT 200`,
        account,
        currency,
        fromInt,
        toInt,
      )
      .toArray()
    const notable = notableRows
      .map((r) => ({
        date: r.date,
        payee: r.payee,
        narration: r.narration,
        amount: toDec(r.amount_scaled, r.scale),
      }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 6)

    return {
      ...empty,
      current,
      inflow,
      outflow,
      txn_count,
      series,
      monthly: [...monthlyMap.entries()]
        .map(([month, net]) => ({ month, net }))
        .sort((a, b) => a.month - b.month),
      composition,
      notable,
    }
  }

  // Advance a capture item's lifecycle state (ledger-pipeline.md §2).
  async set_capture_state(
    id: string,
    state: 'captured' | 'processing' | 'extracted' | 'posted' | 'dismissed',
  ): Promise<{ ok: boolean }> {
    // Terminal transitions clear any lingering draft warning so review
    // counts don't keep flagging an item that's already posted/dismissed.
    const clearWarning = state === 'posted' || state === 'dismissed'
    const cursor = this.db.exec(
      clearWarning
        ? `UPDATE capture_items SET state = ?, draft_error = NULL, updated_at = ? WHERE id = ?`
        : `UPDATE capture_items SET state = ?, updated_at = ? WHERE id = ?`,
      state,
      Date.now(),
      id,
    )
    return { ok: cursor.rowsWritten > 0 }
  }

  // Background statement agent's proposal lands here: entries as a JSON
  // array of beancount strings; the capture flips to 'extracted' so the
  // Inbox offers review. Empty entries leave the row untouched.
  async set_capture_drafts(
    id: string,
    entries: string[],
    // Non-blocking validation warnings: drafts are delivered AND the
    // problems are shown verbatim on the item (never silent).
    warning?: string | null,
  ): Promise<{ ok: boolean }> {
    if (entries.length === 0) return { ok: false }
    const cursor = this.db.exec(
      `UPDATE capture_items SET drafts = ?, draft_error = ?, state = 'extracted', updated_at = ? WHERE id = ?`,
      JSON.stringify(entries),
      warning?.slice(0, 4000) ?? null,
      Date.now(),
      id,
    )
    return { ok: cursor.rowsWritten > 0 }
  }

  // Background drafting failed: back to 'captured' with the reason visible —
  // the item stays fully reviewable in its thread.
  async set_capture_error(id: string, error: string): Promise<{ ok: boolean }> {
    const cursor = this.db.exec(
      `UPDATE capture_items SET draft_error = ?, state = 'captured', updated_at = ? WHERE id = ?`,
      error.slice(0, 4000),
      Date.now(),
      id,
    )
    return { ok: cursor.rowsWritten > 0 }
  }

  // Hard delete: the capture row AND its statement blob — the errored-state
  // escape hatch (dismiss only hides; delete forgets).
  async delete_capture(id: string): Promise<{ ok: boolean }> {
    let removed = 0
    this.ctx.storage.transactionSync(() => {
      removed = this.db.exec(`DELETE FROM capture_items WHERE id = ?`, id).rowsWritten
      this.db.exec(`DELETE FROM statements WHERE id = ?`, id)
    })
    return { ok: removed > 0 }
  }

  // Capture items for the Inbox, newest first.
  async list_captures(): Promise<{
    rows: Array<{
      id: string
      source: string
      artifact: string | null
      filename: string | null
      state: string
      prompt: string | null
      drafts: string | null
      draft_error: string | null
      created_at: number
    }>
  }> {
    const rows = this.db
      .exec<{
        id: string
        source: string
        artifact: string | null
        filename: string | null
        state: string
        prompt: string | null
        drafts: string | null
        draft_error: string | null
        created_at: number
      }>(
        `SELECT id, source, artifact, filename, state, prompt, drafts, draft_error, created_at
         FROM capture_items ORDER BY created_at DESC, id DESC LIMIT 200`,
      )
      .toArray()
    return { rows }
  }

  // ── Email ingestion rules (experience.md §9) ───────────────────────────────

  async list_email_rules(): Promise<{ rows: EmailRule[] }> {
    const rows = this.db
      .exec<EmailRule>(
        `SELECT id, from_match, subject_match, action, prompt, enabled, created_at
         FROM email_rules ORDER BY id ASC`,
      )
      .toArray()
    return { rows }
  }

  async save_email_rule(rule: {
    id?: number | null
    from_match?: string | null
    subject_match?: string | null
    action: 'capture' | 'ignore'
    prompt?: string | null
    enabled: boolean
  }): Promise<{ ok: boolean; id: number }> {
    const now = Date.now()
    if (rule.id != null) {
      this.db.exec(
        `UPDATE email_rules SET from_match = ?, subject_match = ?, action = ?, prompt = ?, enabled = ?, updated_at = ?
         WHERE id = ?`,
        rule.from_match?.trim() || null,
        rule.subject_match?.trim() || null,
        rule.action,
        rule.prompt?.trim() || null,
        rule.enabled ? 1 : 0,
        now,
        rule.id,
      )
      return { ok: true, id: rule.id }
    }
    const r = this.db
      .exec<{ id: number }>(
        `INSERT INTO email_rules (from_match, subject_match, action, prompt, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        rule.from_match?.trim() || null,
        rule.subject_match?.trim() || null,
        rule.action,
        rule.prompt?.trim() || null,
        rule.enabled ? 1 : 0,
        now,
        now,
      )
      .toArray()[0]
    return { ok: true, id: r.id }
  }

  async delete_email_rule(id: number): Promise<{ ok: boolean }> {
    const cursor = this.db.exec(`DELETE FROM email_rules WHERE id = ?`, id)
    return { ok: cursor.rowsWritten > 0 }
  }

  // Evaluate the rules against an inbound email. First enabled match wins
  // (creation order); a matcher matches when every set field is a
  // case-insensitive substring of the corresponding header. No rules match →
  // the safe default: capture with no prompt.
  async match_email_rule(headers: { from: string; subject: string }): Promise<{
    action: 'capture' | 'ignore'
    prompt: string | null
    rule_id: number | null
  }> {
    const from = headers.from.toLowerCase()
    const subject = headers.subject.toLowerCase()
    const rules = this.db
      .exec<EmailRule>(
        `SELECT id, from_match, subject_match, action, prompt, enabled, created_at
         FROM email_rules WHERE enabled = 1 ORDER BY id ASC`,
      )
      .toArray()
    for (const r of rules) {
      const fromOk = !r.from_match || from.includes(r.from_match.toLowerCase())
      const subjOk = !r.subject_match || subject.includes(r.subject_match.toLowerCase())
      if (!r.from_match && !r.subject_match) continue // matcherless rule never fires
      if (fromOk && subjOk) {
        return {
          action: r.action === 'ignore' ? 'ignore' : 'capture',
          prompt: r.prompt ?? null,
          rule_id: r.id,
        }
      }
    }
    return { action: 'capture', prompt: null, rule_id: null }
  }

  // Record an inbound email's outcome (experience.md §9 automation log).
  async record_ingest(entry: {
    from_addr: string | null
    subject: string | null
    outcome: 'captured' | 'ignored' | 'rejected'
    rule_id?: number | null
    capture_id?: string | null
    body_excerpt?: string | null
  }): Promise<{ ok: true }> {
    this.db.exec(
      `INSERT INTO ingest_log (from_addr, subject, outcome, rule_id, capture_id, body_excerpt, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      entry.from_addr,
      entry.subject,
      entry.outcome,
      entry.rule_id ?? null,
      entry.capture_id ?? null,
      entry.body_excerpt ?? null,
      Date.now(),
    )
    return { ok: true }
  }

  async list_ingest_log(): Promise<{
    rows: Array<{
      id: number
      from_addr: string | null
      subject: string | null
      outcome: string
      rule_id: number | null
      capture_id: string | null
      body_excerpt: string | null
      created_at: number
    }>
  }> {
    const rows = this.db
      .exec<{
        id: number
        from_addr: string | null
        subject: string | null
        outcome: string
        rule_id: number | null
        capture_id: string | null
        body_excerpt: string | null
        created_at: number
      }>(
        `SELECT id, from_addr, subject, outcome, rule_id, capture_id, body_excerpt, created_at
         FROM ingest_log ORDER BY id DESC LIMIT 50`,
      )
      .toArray()
    return { rows }
  }

  async get_statement(
    id: string,
  ): Promise<{ filename: string; text: string; images: string[]; ownerEmail: string } | null> {
    const row = this.db
      .exec<{ filename: string; text: string; owner_email: string }>(
        `SELECT filename, text, owner_email FROM statements WHERE id = ?`,
        id,
      )
      .toArray()[0]
    if (!row) return null
    const images = this.db
      .exec<{ data_url: string }>(
        'SELECT data_url FROM statement_images WHERE statement_id = ? ORDER BY idx',
        id,
      )
      .toArray()
      .map((r) => r.data_url)
    return { filename: row.filename, text: row.text, images, ownerEmail: row.owner_email }
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
    this.dropLegacyStatementsTable()
    this.dropStaleFacetRecords()
    this.dropRenamedScheduleCallbacks()
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
    // Apply balance assertions to the materialized balances (plug rows are
    // wiped/rebuilt; triggers keep balance_totals/daily_balances in step).
    try {
      this.rematerializePlugs()
    } catch (e) {
      console.error('[migrate] plug rematerialization failed', { err: String(e) })
    }
  }

  // A prior deploy spawned a `StatementExtractor` facet sub-agent via
  // agentTool(). The agents SDK records facet bookkeeping in
  // `cf_agents_facet_runs` / `cf_agents_sub_agents`; on every alarm and
  // init it tries to rehydrate those facets and now errors with
  // `Sub-agent class "StatementExtractor" not found in worker exports`.
  // The class is gone for good. Wipe the rows so the hydrate path goes
  // quiet. Best-effort — tables may not exist on a fresh DO.
  private dropStaleFacetRecords(): void {
    for (const table of ['cf_agents_facet_runs', 'cf_agents_sub_agents']) {
      try {
        const exists =
          (this.db
            .exec<{ n: number }>(
              "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?",
              table,
            )
            .toArray()[0]?.n ?? 0) > 0
        if (!exists) continue
        const before = this.db
          .exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)
          .toArray()[0]?.n ?? 0
        if (before === 0) continue
        this.db.exec(`DELETE FROM ${table}`)
        console.warn(`[migrate] cleared ${before} stale row(s) from ${table}`)
      } catch (e) {
        console.warn(`[migrate] facet cleanup failed for ${table}`, {
          err: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  // The reconcile watchdog used to be `reconcileExtractions`; it is now the
  // generic `reconcileTasks` (TaskCoordinator). A DO that had an extraction in
  // flight at upgrade time still holds an interval schedule pointing at the old
  // method name. That method is gone, so the alarm would log "callback
  // reconcileExtractions not found" every interval forever and never
  // self-cancel (the canceller was that same method). Delete the orphaned rows.
  // Best-effort — the schedules table may not exist on a fresh DO.
  private dropRenamedScheduleCallbacks(): void {
    try {
      const exists =
        (this.db
          .exec<{ n: number }>(
            "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='cf_agents_schedules'",
          )
          .toArray()[0]?.n ?? 0) > 0
      if (!exists) return
      const before = this.db
        .exec<{ n: number }>(
          "SELECT COUNT(*) AS n FROM cf_agents_schedules WHERE callback='reconcileExtractions'",
        )
        .toArray()[0]?.n ?? 0
      if (before === 0) return
      this.db.exec(
        "DELETE FROM cf_agents_schedules WHERE callback='reconcileExtractions'",
      )
      console.warn(`[migrate] cancelled ${before} orphaned reconcileExtractions schedule(s)`)
    } catch (e) {
      console.warn('[migrate] schedule cleanup failed', {
        err: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // Earlier deploys created `statements` with different shapes (the reverted
  // subagent's status/batch_json/error/used_at, then a leaner
  // id/filename/text/created_at). The current schema adds owner_email, but
  // CREATE TABLE IF NOT EXISTS is a no-op when the table already exists, so a
  // DO carrying any older shape is missing columns our INSERT needs. Statement
  // blobs are transient and nothing reads across deploys, so drop any table
  // that doesn't match the current schema and let SCHEMA_STEPS recreate it.
  private dropLegacyStatementsTable(): void {
    const cols = this.db
      .exec<{ name: string }>('PRAGMA table_info(statements)')
      .toArray()
      .map((r) => r.name)
    if (cols.length === 0) return
    if (!cols.includes('owner_email')) {
      console.warn('[migrate] dropping legacy statements table (missing owner_email)')
      this.db.exec('DROP TABLE statements')
    }
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

  // Accounts that have ANY activity — postings (txns) or balance assertions
  // (opening statements) — each with the currencies seen on it. The balance-
  // update UI lists only these (never an account with no activity) and takes
  // the currency from the chosen account.
  async list_balance_targets(): Promise<Array<{ account: string; currencies: string[] }>> {
    const map = new Map<string, Set<string>>()
    const add = (account: string, currency: string) => {
      if (!account || !currency) return
      let s = map.get(account)
      if (!s) {
        s = new Set()
        map.set(account, s)
      }
      s.add(currency)
    }
    for (const r of this.db
      .exec<{ account: string; currency: string }>(
        `SELECT DISTINCT account, currency FROM postings WHERE currency IS NOT NULL AND currency != ''`,
      )
      .toArray())
      add(r.account, r.currency)
    for (const r of this.db
      .exec<{ account: string; currency: string }>(
        `SELECT DISTINCT account, currency FROM directives_balance WHERE currency IS NOT NULL AND currency != ''`,
      )
      .toArray())
      add(r.account, r.currency)
    return [...map.entries()]
      .map(([account, set]) => ({ account, currencies: [...set].sort() }))
      .sort((a, b) => a.account.localeCompare(b.account))
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


  // Existing entries (canonical text) on each of the given dates — the
  // per-date buckets the incorporation engine rewrites. Few per date, so
  // loading whole days keeps each shard's context small and complete.
  async entries_on_dates(dates: string[]): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {}
    for (const d of dates) {
      const di = dateToInt(d)
      const bucket: string[] = []
      for (const { id } of this.db
        .exec<{ id: number }>('SELECT id FROM transactions WHERE date = ? ORDER BY id', di)
        .toArray()) {
        const e = this.readTxnEntry(id)
        if (e) bucket.push(serializeJournal([entryTxnToInput(e)], [], { descending: false }).trimEnd())
      }
      for (const kind of ALL_DIRECTIVE_KINDS) {
        for (const row of this.readDirectivesByKind(kind)) {
          if (dateToInt(row.input.date) === di) {
            bucket.push(serializeJournal([], [row.input], { descending: false }).trimEnd())
          }
        }
      }
      out[d] = bucket
    }
    return out
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
    // Materialized assertion plugs count like postings — without them the
    // summaries show the raw transaction sum while balance_totals (and the
    // statement's own assertion) say otherwise.
    for (const p of this.db
      .exec<{
        account: string
        currency: string
        amount_scaled: number
        scale: number
        date: number
      }>(
        `SELECT account, currency, amount_scaled, scale, date
         FROM plug_postings WHERE date <= ?`,
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
      // Unconstrained opens (multi-ticker wallets) surface as a zero
      // placeholder ONLY when the account has no real balance anywhere —
      // including a :Pending child. Otherwise the placeholder duplicated a
      // wallet that already shows its true commodity (the '0 pts' dupes).
      const list = currencies.length > 0 ? currencies : ['']
      const hasBalance = [...map.keys()].some((k) => {
        const acct = k.slice(0, k.lastIndexOf('|'))
        return acct === r.account || acct.startsWith(`${r.account}:`)
      })
      for (const c of list) {
        const key = `${r.account}|${c}`
        if (!map.has(key) && (c !== '' || !hasBalance)) {
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

  async propose_journal_edit(opts: {
    instruction: string
    proposed_text: string
    target_txn_ids?: ReadonlyArray<number>
  }): Promise<ProposeJournalEditResponse> {
    const targets = (opts.target_txn_ids ?? []).map((n) => Number(n))

    // Validate the proposed text in isolation. We don't compose against
    // the full ledger any more — replaceBuffer at commit time handles
    // that with proper OCC. This is just a parse/shape gate so the agent
    // gets early failure on a malformed proposal.
    const parsed = parseJournalStrict(opts.proposed_text)
    if (isStrictParseErr(parsed)) {
      return { ok: false, error: parsed.kind, message: parsed.message }
    }

    // before_text: the targeted transactions, rendered for the agent to
    // show the user. Empty when no targets.
    const targetedInputs: TransactionInput[] = []
    for (const id of targets) {
      const entry = this.readTxnEntry(id)
      if (entry) targetedInputs.push(entryTxnToInput(entry))
    }
    const beforeText =
      targetedInputs.length > 0
        ? serializeJournal(targetedInputs, [], { descending: true })
        : ''

    const id = crypto.randomUUID()
    this.db.exec(
      `INSERT INTO agent_proposals (id, created_at, instruction, proposed_text, target_txn_ids, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      id,
      Date.now(),
      opts.instruction,
      opts.proposed_text,
      JSON.stringify(targets),
    )

    return {
      ok: true,
      proposal_id: id,
      instruction: opts.instruction,
      before_text: beforeText,
      proposed_text: opts.proposed_text,
      summary: {
        insert: parsed.transactions.length + parsed.directives.length,
        delete: targets.length,
        unchanged: 0,
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

    // Targets are transactions to drop in favour of the proposed text. We
    // read each target's current updated_at so replaceBuffer's OCC check
    // succeeds; this is an agent-internal write so the read-then-write
    // race is bounded by the DO's input-gate semantics.
    const knownIds: EntryRef2[] = []
    for (const id of targets) {
      const ua = this.readUpdatedAt('txn', id)
      if (ua !== null) knownIds.push({ kind: 'txn', id, expected_updated_at: ua })
    }

    const result = await this.replaceBuffer({ knownIds, buffer: text })
    if ('ok' in result && result.ok === false) {
      if (result.error === 'occ_conflict') {
        return {
          ok: false,
          error: 'parse_error',
          message: 'target transactions changed concurrently',
        }
      }
      return result
    }

    this.db.exec(
      `UPDATE agent_proposals SET status = 'committed' WHERE id = ?`,
      opts.proposal_id,
    )

    const journal = this.journal_get_sync()
    return {
      ok: true,
      proposal_id: opts.proposal_id,
      text: journal.text,
      inserted: result.rows.length,
      deleted: knownIds.length,
      unchanged: 0,
    }
  }

  async listEntries(): Promise<ListEntriesResponse> {
    return { rows: this.listEntriesSync() }
  }

  // Order matches serializeJournal({descending: true}): date DESC, then
  // intraday weight (note < pad < balance < else), then id ASC for stability.
  // Each row's raw_text is the entry serialized on its own, trimmed of trailing
  // newlines so callers can join with '\n\n'.
  private listEntriesSync(): EntryRow[] {
    type Item = {
      row: EntryRow
      dateInt: number
      intraday: number
    }
    const items: Item[] = []

    const txnIds = this.db
      .exec<{ id: number }>('SELECT id FROM transactions')
      .toArray()
      .map((r) => r.id)
    for (const id of txnIds) {
      const e = this.readTxnEntry(id)
      if (!e) continue
      const input = entryTxnToInput(e)
      const raw = serializeJournal([input], [], { descending: false }).trimEnd()
      items.push({
        row: { kind: 'txn', id, raw_text: raw, updated_at: e.updated_at },
        dateInt: dateToInt(e.date),
        intraday: 3,
      })
    }

    for (const kind of ALL_DIRECTIVE_KINDS) {
      for (const row of this.readDirectivesByKind(kind)) {
        const updatedAt = this.readUpdatedAt(kind, row.id) ?? 0
        const raw = serializeJournal([], [row.input], { descending: false }).trimEnd()
        const intraday =
          kind === 'note'
            ? 0
            : kind === 'balance' && row.input.kind === 'balance' && row.input.plug_account
              ? 1
              : kind === 'balance'
                ? 2
                : 3
        items.push({
          row: { kind, id: row.id, raw_text: raw, updated_at: updatedAt },
          dateInt: dateToInt(row.input.date),
          intraday,
        })
      }
    }

    items.sort((a, b) => {
      if (a.dateInt !== b.dateInt) return b.dateInt - a.dateInt
      if (a.intraday !== b.intraday) return a.intraday - b.intraday
      return a.row.id - b.row.id
    })
    return items.map((i) => i.row)
  }

  async replaceBuffer(req: ReplaceBufferRequest): Promise<ReplaceBufferResponse> {
    return this.ctx.blockConcurrencyWhile(async () => {
      // 1. OCC: verify every knownId still has the expected updated_at.
      const conflicts: ReplaceBufferConflict['conflictingIds'] = []
      for (const ref of req.knownIds) {
        const current = this.readUpdatedAt(ref.kind, ref.id)
        if (current === null || current !== ref.expected_updated_at) {
          conflicts.push({
            kind: ref.kind,
            id: ref.id,
            current_updated_at: current,
          })
        }
      }
      if (conflicts.length > 0) {
        return { ok: false, error: 'occ_conflict', conflictingIds: conflicts }
      }

      // 2. Parse the buffer.
      const parsed = parseJournalStrict(req.buffer)
      if (isStrictParseErr(parsed)) {
        return { ok: false, error: parsed.kind, message: parsed.message }
      }

      // 3. Validate the post-state (carry-over entries + parsed buffer).
      const knownTxnIds = new Set<number>()
      const knownDirIds = new Map<DirectiveInput['kind'], Set<number>>()
      for (const k of ALL_DIRECTIVE_KINDS) knownDirIds.set(k, new Set())
      for (const ref of req.knownIds) {
        if (ref.kind === 'txn') knownTxnIds.add(ref.id)
        else knownDirIds.get(ref.kind)!.add(ref.id)
      }
      const carryTxns: TransactionInput[] = []
      for (const r of this.db
        .exec<{ id: number }>('SELECT id FROM transactions')
        .toArray()) {
        if (knownTxnIds.has(r.id)) continue
        const e = this.readTxnEntry(r.id)
        if (e) carryTxns.push(entryTxnToInput(e))
      }
      const carryDirs: DirectiveInput[] = []
      for (const kind of ALL_DIRECTIVE_KINDS) {
        const skip = knownDirIds.get(kind)!
        for (const row of this.readDirectivesByKind(kind)) {
          if (!skip.has(row.id)) carryDirs.push(row.input)
        }
      }
      const postTxns = [...carryTxns, ...parsed.transactions]
      const postDirs = [...carryDirs, ...parsed.directives]
      const issues = validateAccountCurrencies(postTxns, postDirs)
      if (issues.length > 0) {
        return {
          ok: false,
          error: 'currency_lock',
          message: issues.map((i) => i.message).join('; '),
        }
      }
      const shapeIssues = validateAccountShapes(postTxns, postDirs)
      if (shapeIssues.length > 0) {
        return {
          ok: false,
          error: 'credit_card_format',
          message: shapeIssues.map((i) => i.message).join('; '),
        }
      }
      // Per-currency balance — only check the newly-parsed transactions;
      // carry-overs were already validated when they were originally written.
      const balanceIssues = validateBatchBalance(parsed.transactions)
      if (balanceIssues.length > 0) {
        return {
          ok: false,
          error: 'unbalanced',
          message: balanceIssues.map((i) => i.message).join('; '),
        }
      }

      // 4. Pre-compute txn hashes (async; can't run inside transactionSync).
      const txnHashes: string[] = []
      for (const t of parsed.transactions) {
        txnHashes.push(await transactionInputHash(t))
      }

      // 5. Atomic: DELETE the knownIds, INSERT parsed entries.
      // Owner ruling: creating a card account implies its linked rewards
      // programme exists. The wallet is convention-derived
      // (Assets:Rewards:<Issuer>, account-first taxonomy) and multi-ticker,
      // so an UNCONSTRAINED open is the correct creation. Only when neither
      // the ledger nor this batch already has it.
      // Card creation in practice is EITHER an open directive OR the first
      // posting to a card account (owner caught the gap: a 0.00 opening
      // transaction creates the card with no open directive at all).
      const cardCreations: Array<{ account: string; date: string }> = []
      for (const d of parsed.directives) {
        if (d.kind === 'open') cardCreations.push({ account: d.account, date: d.date })
      }
      for (const t of parsed.transactions) {
        for (const p of t.postings) {
          cardCreations.push({ account: p.account, date: t.date })
        }
      }
      const seenWallets = new Set<string>()
      for (const d of cardCreations) {
        const parts = d.account.split(':')
        if (parts[0] !== 'Liabilities' || parts[1] !== 'CreditCards' || !parts[2]) continue
        const wallet = `Assets:Rewards:${parts[2]}`
        if (seenWallets.has(wallet)) continue
        seenWallets.add(wallet)
        const inBatch = parsed.directives.some(
          (x) => x.kind === 'open' && x.account === wallet,
        )
        if (inBatch) continue
        const inLedger =
          (this.db
            .exec<{ c: number }>(
              `SELECT
                (SELECT COUNT(*) FROM directives_open WHERE account = ?)
              + (SELECT COUNT(*) FROM postings WHERE account = ?) AS c`,
              wallet,
              wallet,
            )
            .toArray()[0]?.c ?? 0) > 0
        if (inLedger) continue
        parsed.directives.push({ kind: 'open', date: d.date, account: wallet })
      }

      const now = Date.now()
      let assertionFailures: ReturnType<LedgerDO['rematerializePlugs']> = []
      try {
        this.ctx.storage.transactionSync(() => {
          for (const ref of req.knownIds) {
            const table =
              ref.kind === 'txn' ? 'transactions' : DIRECTIVE_TABLE[ref.kind]
            this.db.exec(`DELETE FROM ${table} WHERE id = ?`, ref.id)
          }
          parsed.transactions.forEach((t, i) =>
            this.insertTxn(t, txnHashes[i]!, now),
          )
          for (const d of parsed.directives) this.insertDirective(d, now)
          // Apply balance assertions: pads materialize their gap; hard
          // assertions (no plug) with a gap abort the whole write.
          assertionFailures = this.rematerializePlugs()
          if (assertionFailures.length > 0) {
            throw new Error('__assertion_failed__')
          }
        })
      } catch (e) {
        if (String(e).includes('__assertion_failed__')) {
          return {
            ok: false,
            error: 'balance_assertion_failed',
            message: assertionFailures
              .map(
                (f) =>
                  `balance assertion failed: ${f.account} ${f.currency} on ${f.date} — asserted ${f.asserted}, computed ${f.computed} (add a pad to absorb the gap, or fix the missing entries)`,
              )
              .join('\n'),
          }
        }
        throw e
      }

      return { ok: true, rows: this.listEntriesSync() }
    })
  }

  // Materialize balance assertions: for each directive in (account,
  // currency, date) order, the gap between the asserted amount and the
  // posting-derived running balance at start-of-date becomes a synthetic
  // posting pair routed through plug_account (the pad), dated the previous
  // day so start-of-date semantics include it. Directives WITHOUT a plug
  // are hard assertions: any gap aborts the write. Rebuilt wholesale on
  // every journal write — O(directives × lookups), tiny for one user.
  private rematerializePlugs(): Array<{
    account: string
    currency: string
    date: string
    asserted: string
    computed: string
  }> {
    const TARGET_SCALE = 12
    this.db.exec('DELETE FROM plug_postings')
    const failures: Array<{
      account: string
      currency: string
      date: string
      asserted: string
      computed: string
    }> = []
    const dirs = this.db
      .exec<{
        id: number
        date: number
        account: string
        amount_scaled: number
        scale: number
        currency: string
        plug_account: string | null
      }>(
        `SELECT id, date, account, amount_scaled, scale, currency, plug_account
         FROM directives_balance
         ORDER BY account, currency, date, id`,
      )
      .toArray()
    // Running plug total per (account|currency), at TARGET_SCALE.
    const plugged = new Map<string, bigint>()
    for (const d of dirs) {
      const key = `${d.account}|${d.currency}`
      const posted = this.db
        .exec<{ scale: number; s: number | null }>(
          `SELECT scale, SUM(amount_scaled) AS s FROM postings
           WHERE account = ? AND currency = ? AND date < ?
           GROUP BY scale`,
          d.account,
          d.currency,
          d.date,
        )
        .toArray()
        .reduce(
          (acc, r) =>
            acc + BigInt(r.s ?? 0) * 10n ** BigInt(TARGET_SCALE - r.scale),
          0n,
        )
      const computed = posted + (plugged.get(key) ?? 0n)
      const asserted =
        BigInt(d.amount_scaled) * 10n ** BigInt(TARGET_SCALE - d.scale)
      const gap = asserted - computed
      if (gap === 0n) continue
      if (!d.plug_account) {
        const toDec = (v: bigint) => (Number(v) / 10 ** TARGET_SCALE).toFixed(2)
        failures.push({
          account: d.account,
          currency: d.currency,
          date: String(d.date),
          asserted: toDec(asserted),
          computed: toDec(computed),
        })
        continue
      }
      // Dated the day before the assertion (start-of-day semantics).
      const dt = String(d.date)
      const prev = new Date(
        Date.UTC(Number(dt.slice(0, 4)), Number(dt.slice(4, 6)) - 1, Number(dt.slice(6, 8)) - 1),
      )
      const prevInt = Number(
        `${prev.getUTCFullYear()}${String(prev.getUTCMonth() + 1).padStart(2, '0')}${String(prev.getUTCDate()).padStart(2, '0')}`,
      )
      this.db.exec(
        `INSERT INTO plug_postings (directive_id, account, amount_scaled, scale, currency, date)
         VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`,
        d.id,
        d.account,
        Number(gap),
        TARGET_SCALE,
        d.currency,
        prevInt,
        d.id,
        d.plug_account,
        Number(-gap),
        TARGET_SCALE,
        d.currency,
        prevInt,
      )
      plugged.set(key, (plugged.get(key) ?? 0n) + gap)
    }
    return failures
  }

  private readUpdatedAt(kind: EntryKind, id: number): number | null {
    const table = kind === 'txn' ? 'transactions' : DIRECTIVE_TABLE[kind]
    const row = this.db
      .exec<{ updated_at: number }>(
        `SELECT updated_at FROM ${table} WHERE id = ?`,
        id,
      )
      .toArray()[0]
    return row ? row.updated_at : null
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

    // Accounts that exist only via postings / pads / balance assertions (no
    // explicit `open` directive — e.g. a credit card brought in by a
    // statement import) are still real accounts. Union them in so the editor
    // account dropdown, filter, and agent context see them too.
    const known = new Set(accountList.map((a) => a.account))
    for (const r of this.db
      .exec<{ account: string }>(
        `SELECT account FROM postings
         UNION SELECT account FROM plug_postings
         UNION SELECT account FROM directives_balance`,
      )
      .toArray()) {
      if (!known.has(r.account)) {
        known.add(r.account)
        accountList.push({ account: r.account, currencies: [], open_date: 0, close_date: null })
      }
    }
    accountList.sort((a, b) => a.account.localeCompare(b.account))

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
