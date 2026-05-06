import { DurableObject } from 'cloudflare:workers'
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

export class LedgerDO extends DurableObject<CloudflareEnv> {
  private sql: SqlStorage

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    super(state, env)
    this.sql = state.storage.sql
    this.migrate()
  }

  private migrate(): void {
    const v2Exists =
      (this.sql
        .exec<{ n: number }>(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='transactions_v2'",
        )
        .toArray()[0]?.n ?? 0) > 0
    if (v2Exists) {
      this.sql.exec('DROP TABLE IF EXISTS transactions')
      this.sql.exec('ALTER TABLE transactions_v2 RENAME TO transactions')
    }
    for (const step of SCHEMA_STEPS) {
      try {
        this.sql.exec(step.sql)
      } catch (e) {
        if (step.allowFail) continue
        console.error(`[migrate] step ${step.label} failed`, { err: String(e) })
        throw e
      }
    }
  }

  async journal_get(): Promise<JournalGetResponse> {
    const txnIds = this.sql
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
    const txnIds = this.sql
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
    const txnIds = this.sql
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
      for (const r of this.sql.exec<{ account: string }>(sql, ...binds).toArray()) {
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
    for (const r of this.sql
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
    for (const r of this.sql
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
    for (const p of this.sql
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
    for (const r of this.sql
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
    for (const r of this.sql
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
    // TODO: parseJournalStrict already rejects elided postings (every posting
    // must carry an explicit amount + currency). Surface a dedicated error
    // kind ('elided_posting') here so the UI can show a targeted message
    // instead of the generic 'parse_error'.
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

    const allKinds: DirectiveInput['kind'][] = [
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

    // Pre-compute all hashes (async work must finish before transactionSync)
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
    for (const r of this.sql
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

    // Compute diff (pure)
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

    // Apply atomically: any throw inside rolls back all writes
    const now = Date.now()
    this.ctx.storage.transactionSync(() => {
      for (const id of txnIdsToDelete) {
        this.sql.exec('DELETE FROM transactions WHERE id = ?', id)
      }
      for (const { input, hash } of txnsToInsert) this.insertTxn(input, hash, now)
      for (const kind of allKinds) {
        const table = DIRECTIVE_TABLE[kind]
        for (const id of dirIdsToDeleteByKind.get(kind)!) {
          this.sql.exec(`DELETE FROM ${table} WHERE id = ?`, id)
        }
        for (const d of dirsToInsertByKind.get(kind)!) this.insertDirective(d, now)
      }
    })

    const result = await this.journal_get()
    return { text: result.text, inserted, deleted, unchanged }
  }

  async clear(): Promise<{ ok: true }> {
    for (const t of DATA_TABLES) {
      this.sql.exec(`DELETE FROM ${t}`)
    }
    return { ok: true }
  }

  private insertTxn(input: TransactionInput, hash: string, now: number): void {
    const dateInt = dateToInt(input.date)
    const flag = input.flag ?? null
    const payee = input.payee ?? ''
    const narration = input.narration ?? ''
    const meta = JSON.stringify(input.meta ?? {})
    const result = this.sql.exec<{ id: number }>(
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
      this.sql.exec(
        'INSERT OR IGNORE INTO txn_tags (txn_id, tag, from_stack) VALUES (?, ?, 0)',
        txnId,
        tag,
      )
    }
    for (const link of input.links ?? []) {
      this.sql.exec(
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
        return this.sql
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
        return this.sql
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
        return this.sql
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
        return this.sql
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
        return this.sql
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
        return this.sql
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
        return this.sql
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
        return this.sql
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
        return this.sql
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
        this.sql.exec(
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
        this.sql.exec(
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
        this.sql.exec(
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
        this.sql.exec(
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
        this.sql.exec(
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
        this.sql.exec(
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
        this.sql.exec(
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
        this.sql.exec(
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
        this.sql.exec(
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
    this.sql.exec(
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
    const totalRow = this.sql
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
    const txnRefs = this.sql
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

    const directiveRefs = this.sql
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

    const docRefs = this.sql
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
    const head = this.sql
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
    const postingRows = this.sql
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
    const tags = this.sql
      .exec<{ tag: string }>(
        'SELECT tag FROM txn_tags WHERE txn_id = ? ORDER BY tag ASC',
        id,
      )
      .toArray()
      .map((r) => r.tag)
    const links = this.sql
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
    const row = this.sql
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
    const row = this.sql
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
    const row = this.sql
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
    const row = this.sql
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
    const row = this.sql
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
    const row = this.sql
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
