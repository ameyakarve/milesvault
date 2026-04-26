import { DurableObject } from 'cloudflare:workers'
import { SCHEMA_STEPS_V2 } from '@/lib/ledger-core/schema-v2'
import {
  buildTransactionAst,
  dateFromInt,
  dateToInt,
  parseText,
  scaleDecimal,
  serializeDirective,
  serializeTransaction,
  validateDirective,
  validateInput,
  type ConstraintResolver,
} from '@/lib/beancount/v2-ast'
import type {
  DirectiveBalance,
  DirectiveClose,
  DirectiveCommodity,
  DirectiveCreateResult,
  DirectiveDeleteResult,
  DirectiveDocument,
  DirectiveEvent,
  DirectiveInput,
  DirectiveKind,
  DirectiveListResult,
  DirectiveNote,
  DirectiveOpen,
  DirectivePad,
  DirectivePrice,
  DirectiveTransaction,
  DirectiveUpdateResult,
  DirectiveV2,
  Posting as PostingV2,
  PostingInput,
  TransactionInput,
  TransactionV2,
  V2CreateResult,
  V2DeleteResult,
  V2ListResult,
  V2ReplaceAllResult,
  V2UpdateResult,
} from './ledger-v2-types'
import type { SearchFilter } from './search-parser'

const MAX_UPDATED_AT_SQL = `SELECT MAX(m) AS m FROM (
  SELECT MAX(updated_at) AS m FROM transactions_v2
  UNION ALL SELECT MAX(updated_at) FROM directives_open
  UNION ALL SELECT MAX(updated_at) FROM directives_close
  UNION ALL SELECT MAX(updated_at) FROM directives_commodity
  UNION ALL SELECT MAX(updated_at) FROM directives_balance
  UNION ALL SELECT MAX(updated_at) FROM directives_pad
  UNION ALL SELECT MAX(updated_at) FROM directives_price
  UNION ALL SELECT MAX(updated_at) FROM directives_note
  UNION ALL SELECT MAX(updated_at) FROM directives_document
  UNION ALL SELECT MAX(updated_at) FROM directives_event
)`

export class LedgerDO extends DurableObject<CloudflareEnv> {
  private sql: SqlStorage

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    super(state, env)
    this.sql = state.storage.sql
    this.migrate()
  }

  private migrate(): void {
    for (const [label, sql] of SCHEMA_STEPS_V2) {
      try {
        this.sql.exec(sql)
      } catch (e) {
        console.error(`[migrate] v2 step ${label} failed`, { err: String(e) })
        throw e
      }
    }
  }

  async v2_create(input: TransactionInput): Promise<V2CreateResult> {
    const prepared = prepareV2Input(input)
    if (prepared.ok === false) return { ok: false, errors: prepared.errors }
    const rawText = prepared.rawText
    const now = Date.now()
    let txn: TransactionV2 | null = null
    this.ctx.storage.transactionSync(() => {
      const row = this.sql
        .exec<{ id: number }>(
          `INSERT INTO transactions_v2
             (date, flag, payee, narration, meta_json, raw_text, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id`,
          dateToInt(input.date),
          input.flag ?? null,
          input.payee ?? '',
          input.narration ?? '',
          JSON.stringify(input.meta ?? {}),
          rawText,
          now,
          now,
        )
        .toArray()[0]
      if (!row) return
      this.insertV2Children(row.id, input)
      txn = this.readV2Transaction(row.id)
    })
    return txn ? { ok: true, transaction: txn } : { ok: false, errors: ['Insert failed.'] }
  }

  async v2_get(id: number): Promise<TransactionV2 | null> {
    return this.readV2Transaction(id)
  }

  async v2_list(limit: number, offset: number): Promise<V2ListResult> {
    const total =
      this.sql
        .exec<{ c: number }>('SELECT COUNT(*) AS c FROM transactions_v2')
        .toArray()[0]?.c ?? 0
    const ids = this.sql
      .exec<{ id: number }>(
        `SELECT id FROM transactions_v2
         ORDER BY date DESC, id DESC
         LIMIT ? OFFSET ?`,
        limit,
        offset,
      )
      .toArray()
      .map((r) => r.id)
    const rows: TransactionV2[] = []
    for (const id of ids) {
      const t = this.readV2Transaction(id)
      if (t) rows.push(t)
    }
    return { rows, total, limit, offset }
  }

  async v2_update(
    id: number,
    expected_updated_at: number,
    input: TransactionInput,
  ): Promise<V2UpdateResult> {
    const prepared = prepareV2Input(input)
    if (prepared.ok === false) {
      return { ok: false, kind: 'validation', errors: prepared.errors }
    }
    const rawText = prepared.rawText
    let result: V2UpdateResult = { ok: false, kind: 'not_found' }
    this.ctx.storage.transactionSync(() => {
      const current = this.sql
        .exec<{ updated_at: number }>(
          'SELECT updated_at FROM transactions_v2 WHERE id = ?',
          id,
        )
        .toArray()[0]
      if (!current) {
        result = { ok: false, kind: 'not_found' }
        return
      }
      if (current.updated_at !== expected_updated_at) {
        result = {
          ok: false,
          kind: 'conflict',
          current_updated_at: current.updated_at,
        }
        return
      }
      const now = Date.now()
      this.sql.exec(
        `UPDATE transactions_v2 SET
           date = ?, flag = ?, payee = ?, narration = ?, meta_json = ?,
           raw_text = ?, updated_at = max(?, updated_at + 1)
         WHERE id = ?`,
        dateToInt(input.date),
        input.flag ?? null,
        input.payee ?? '',
        input.narration ?? '',
        JSON.stringify(input.meta ?? {}),
        rawText,
        now,
        id,
      )
      this.sql.exec('DELETE FROM postings WHERE txn_id = ?', id)
      this.sql.exec('DELETE FROM txn_tags WHERE txn_id = ?', id)
      this.sql.exec('DELETE FROM txn_links WHERE txn_id = ?', id)
      this.insertV2Children(id, input)
      const txn = this.readV2Transaction(id)
      result = txn ? { ok: true, transaction: txn } : { ok: false, kind: 'not_found' }
    })
    return result
  }

  async v2_delete(id: number, expected_updated_at: number): Promise<V2DeleteResult> {
    let result: V2DeleteResult = { ok: false, kind: 'not_found' }
    this.ctx.storage.transactionSync(() => {
      const current = this.sql
        .exec<{ updated_at: number }>(
          'SELECT updated_at FROM transactions_v2 WHERE id = ?',
          id,
        )
        .toArray()[0]
      if (!current) {
        result = { ok: false, kind: 'not_found' }
        return
      }
      if (current.updated_at !== expected_updated_at) {
        result = {
          ok: false,
          kind: 'conflict',
          current_updated_at: current.updated_at,
        }
        return
      }
      this.sql.exec('DELETE FROM transactions_v2 WHERE id = ?', id)
      result = { ok: true }
    })
    return result
  }

  async v2_directive_create(directives: DirectiveInput[]): Promise<DirectiveCreateResult> {
    if (directives.length === 0) return { ok: false, errors: ['no directives provided'] }
    const resolve = this.batchResolver(directives)
    const prepared: { d: DirectiveInput; rawText: string }[] = []
    for (let i = 0; i < directives.length; i++) {
      const d = directives[i]
      const errs = validateDirective(d, resolve)
      if (errs.length > 0) {
        return { ok: false, errors: errs.map((e) => `directives[${i}]: ${e}`) }
      }
      let rawText: string
      try {
        rawText = serializeDirective(d)
      } catch (e) {
        return { ok: false, errors: [`directives[${i}]: serialize failed: ${String(e)}`] }
      }
      prepared.push({ d, rawText })
    }
    const created: DirectiveV2[] = []
    this.ctx.storage.transactionSync(() => {
      const now = Date.now()
      for (const { d, rawText } of prepared) {
        const id = this.insertDirective(d, rawText, now, now)
        if (id == null) continue
        const out = this.readDirective(d.kind, id)
        if (out) created.push(out)
      }
    })
    return { ok: true, directives: created }
  }

  async v2_directive_get(kind: DirectiveKind, id: number): Promise<DirectiveV2 | null> {
    return this.readDirective(kind, id)
  }

  async v2_directive_list(limit: number, offset: number): Promise<DirectiveListResult> {
    const total = this.directiveTotalCount()
    const refs = this.sql
      .exec<{ kind: string; id: number; date: number }>(
        `SELECT * FROM (
           SELECT 'transaction' AS kind, id, date FROM transactions_v2
           UNION ALL SELECT 'open', id, date FROM directives_open
           UNION ALL SELECT 'close', id, date FROM directives_close
           UNION ALL SELECT 'commodity', id, date FROM directives_commodity
           UNION ALL SELECT 'balance', id, date FROM directives_balance
           UNION ALL SELECT 'pad', id, date FROM directives_pad
           UNION ALL SELECT 'price', id, date FROM directives_price
           UNION ALL SELECT 'note', id, date FROM directives_note
           UNION ALL SELECT 'document', id, date FROM directives_document
           UNION ALL SELECT 'event', id, date FROM directives_event
         )
         ORDER BY date DESC, kind ASC, id DESC
         LIMIT ? OFFSET ?`,
        limit,
        offset,
      )
      .toArray()
    const rows: DirectiveV2[] = []
    for (const r of refs) {
      const out = this.readDirective(r.kind as DirectiveKind, r.id)
      if (out) rows.push(out)
    }
    return { rows, total, limit, offset }
  }

  async v2_directive_update(
    kind: DirectiveKind,
    id: number,
    expected_updated_at: number,
    d: DirectiveInput,
  ): Promise<DirectiveUpdateResult> {
    if (d.kind !== kind) {
      return { ok: false, kind: 'wrong_kind', expected: kind, actual: d.kind }
    }
    const resolve = this.batchResolver([d])
    const errs = validateDirective(d, resolve)
    if (errs.length > 0) return { ok: false, kind: 'validation', errors: errs }
    let rawText: string
    try {
      rawText = serializeDirective(d)
    } catch (e) {
      return { ok: false, kind: 'validation', errors: [`serialize failed: ${String(e)}`] }
    }
    let result: DirectiveUpdateResult = { ok: false, kind: 'not_found' }
    this.ctx.storage.transactionSync(() => {
      const table = directiveTable(kind)
      const current = this.sql
        .exec<{ updated_at: number; created_at: number }>(
          `SELECT updated_at, created_at FROM ${table} WHERE id = ?`,
          id,
        )
        .toArray()[0]
      if (!current) {
        result = { ok: false, kind: 'not_found' }
        return
      }
      if (current.updated_at !== expected_updated_at) {
        result = { ok: false, kind: 'conflict', current_updated_at: current.updated_at }
        return
      }
      const now = Date.now()
      const nextUpdated = Math.max(now, current.updated_at + 1)
      this.deleteDirectiveRow(kind, id)
      const newId = this.insertDirective(d, rawText, nextUpdated, current.created_at, id)
      if (newId == null) {
        result = { ok: false, kind: 'not_found' }
        return
      }
      const out = this.readDirective(kind, newId)
      result = out ? { ok: true, directive: out } : { ok: false, kind: 'not_found' }
    })
    return result
  }

  async v2_directive_delete(
    kind: DirectiveKind,
    id: number,
    expected_updated_at: number,
  ): Promise<DirectiveDeleteResult> {
    let result: DirectiveDeleteResult = { ok: false, kind: 'not_found' }
    this.ctx.storage.transactionSync(() => {
      const table = directiveTable(kind)
      const current = this.sql
        .exec<{ updated_at: number }>(
          `SELECT updated_at FROM ${table} WHERE id = ?`,
          id,
        )
        .toArray()[0]
      if (!current) {
        result = { ok: false, kind: 'not_found' }
        return
      }
      if (current.updated_at !== expected_updated_at) {
        result = { ok: false, kind: 'conflict', current_updated_at: current.updated_at }
        return
      }
      this.deleteDirectiveRow(kind, id)
      result = { ok: true }
    })
    return result
  }

  async v2_account_constraints(account: string): Promise<string[] | null> {
    return this.latestOpenConstraints(account)
  }

  async v2_listAccounts(): Promise<string[]> {
    const rows = this.sql
      .exec<{ account: string }>(
        `SELECT account FROM postings WHERE account != ''
         UNION SELECT account FROM directives_open WHERE account != ''
         UNION SELECT account FROM directives_close WHERE account != ''
         UNION SELECT account FROM directives_balance WHERE account != ''
         UNION SELECT account FROM directives_pad WHERE account != ''
         UNION SELECT account_pad AS account FROM directives_pad WHERE account_pad != ''
         UNION SELECT account FROM directives_note WHERE account != ''
         UNION SELECT account FROM directives_document WHERE account != ''
         ORDER BY account`,
      )
      .toArray()
    return rows.map((r) => r.account)
  }

  async v2_search(filter: SearchFilter, limit: number, offset: number): Promise<V2ListResult> {
    const where: string[] = []
    const args: SqlStorageValue[] = []
    if (filter.accountTokens.length > 0) {
      const sub: string[] = []
      for (const tok of filter.accountTokens) {
        sub.push(`LOWER(p.account) LIKE ?`)
        args.push(`%${tok.toLowerCase()}%`)
      }
      where.push(
        `t.id IN (SELECT p.txn_id FROM postings p WHERE ${sub.join(' AND ')})`,
      )
    }
    if (filter.tagTokens.length > 0) {
      for (const tok of filter.tagTokens) {
        where.push(`t.id IN (SELECT txn_id FROM txn_tags WHERE LOWER(tag) = ?)`)
        args.push(tok.toLowerCase())
      }
    }
    if (filter.linkTokens.length > 0) {
      for (const tok of filter.linkTokens) {
        where.push(`t.id IN (SELECT txn_id FROM txn_links WHERE LOWER(link) = ?)`)
        args.push(tok.toLowerCase())
      }
    }
    if (filter.dateFrom != null) {
      where.push('t.date >= ?')
      args.push(filter.dateFrom)
    }
    if (filter.dateTo != null) {
      where.push('t.date <= ?')
      args.push(filter.dateTo)
    }
    for (const tok of filter.freeTokens) {
      where.push(`(LOWER(t.payee) LIKE ? OR LOWER(t.narration) LIKE ? OR LOWER(t.raw_text) LIKE ?)`)
      const like = `%${tok.toLowerCase()}%`
      args.push(like, like, like)
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    const totalRow = this.sql
      .exec<{ c: number }>(`SELECT COUNT(*) AS c FROM transactions_v2 t ${whereSql}`, ...args)
      .toArray()[0]
    const total = totalRow?.c ?? 0
    const ids = this.sql
      .exec<{ id: number }>(
        `SELECT t.id FROM transactions_v2 t ${whereSql}
         ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?`,
        ...args,
        limit,
        offset,
      )
      .toArray()
      .map((r) => r.id)
    const rows: TransactionV2[] = []
    for (const id of ids) {
      const t = this.readV2Transaction(id)
      if (t) rows.push(t)
    }
    return { rows, total, limit, offset }
  }

  async v2_max_updated_at(): Promise<number> {
    return this.maxUpdatedAtSync()
  }

  async v2_replace_all(
    buffer: string,
    expected_max_updated_at: number,
  ): Promise<V2ReplaceAllResult> {
    const parsed = parseText(buffer)
    if (parsed.ok === false) return { ok: false, kind: 'validation', errors: parsed.errors }
    const directives = parsed.directives
    const resolve = this.batchResolver(directives)
    const prepared: { d: DirectiveInput; rawText: string }[] = []
    for (let i = 0; i < directives.length; i++) {
      const d = directives[i]
      const errs = validateDirective(d, resolve)
      if (errs.length > 0) {
        return { ok: false, kind: 'validation', errors: errs.map((e) => `directives[${i}]: ${e}`) }
      }
      let rawText: string
      try {
        rawText = serializeDirective(d)
      } catch (e) {
        return {
          ok: false,
          kind: 'validation',
          errors: [`directives[${i}]: serialize failed: ${String(e)}`],
        }
      }
      prepared.push({ d, rawText })
    }
    let result: V2ReplaceAllResult = { ok: false, kind: 'conflict', current_max_updated_at: 0 }
    this.ctx.storage.transactionSync(() => {
      const current = this.maxUpdatedAtSync()
      if (current !== expected_max_updated_at) {
        result = { ok: false, kind: 'conflict', current_max_updated_at: current }
        return
      }
      this.sql.exec('DELETE FROM transactions_v2')
      this.sql.exec('DELETE FROM directives_open')
      this.sql.exec('DELETE FROM directives_close')
      this.sql.exec('DELETE FROM directives_commodity')
      this.sql.exec('DELETE FROM directives_balance')
      this.sql.exec('DELETE FROM directives_pad')
      this.sql.exec('DELETE FROM directives_price')
      this.sql.exec('DELETE FROM directives_note')
      this.sql.exec('DELETE FROM directives_document')
      this.sql.exec('DELETE FROM directives_event')
      const out: DirectiveV2[] = []
      const now = Date.now()
      for (const { d, rawText } of prepared) {
        const id = this.insertDirective(d, rawText, now, now)
        if (id == null) continue
        const dir = this.readDirective(d.kind, id)
        if (dir) out.push(dir)
      }
      result = { ok: true, directives: out, max_updated_at: now }
    })
    return result
  }

  private maxUpdatedAtSync(): number {
    const r = this.sql.exec<{ m: number | null }>(MAX_UPDATED_AT_SQL).toArray()[0]
    return r?.m ?? 0
  }

  private latestOpenConstraints(account: string): string[] | null {
    const r = this.sql
      .exec<{ constraint_currencies: string }>(
        `SELECT constraint_currencies FROM directives_open
         WHERE account = ?
         ORDER BY date DESC, id DESC LIMIT 1`,
        account,
      )
      .toArray()[0]
    if (!r) return null
    return parseStringArray(r.constraint_currencies)
  }

  private batchResolver(directives: DirectiveInput[]): ConstraintResolver {
    const inBatch = new Map<string, string[]>()
    for (const d of directives) {
      if (d.kind === 'open') {
        inBatch.set(d.input.account, d.input.constraint_currencies ?? [])
      }
    }
    const dbCache = new Map<string, string[] | null>()
    return (account: string): string[] | null => {
      const v = inBatch.get(account)
      if (v != null) return v
      if (dbCache.has(account)) return dbCache.get(account)!
      const fetched = this.latestOpenConstraints(account)
      dbCache.set(account, fetched)
      return fetched
    }
  }

  private directiveTotalCount(): number {
    const row = this.sql
      .exec<{ c: number }>(
        `SELECT (
           (SELECT COUNT(*) FROM transactions_v2)
         + (SELECT COUNT(*) FROM directives_open)
         + (SELECT COUNT(*) FROM directives_close)
         + (SELECT COUNT(*) FROM directives_commodity)
         + (SELECT COUNT(*) FROM directives_balance)
         + (SELECT COUNT(*) FROM directives_pad)
         + (SELECT COUNT(*) FROM directives_price)
         + (SELECT COUNT(*) FROM directives_note)
         + (SELECT COUNT(*) FROM directives_document)
         + (SELECT COUNT(*) FROM directives_event)
         ) AS c`,
        )
      .toArray()[0]
    return row?.c ?? 0
  }

  private insertDirective(
    d: DirectiveInput,
    rawText: string,
    updatedAt: number,
    createdAt: number,
    forcedId?: number,
  ): number | null {
    if (d.kind === 'transaction') {
      const id = this.insertTransactionRow(d.input, rawText, updatedAt, createdAt, forcedId)
      if (id == null) return null
      this.insertV2Children(id, d.input)
      return id
    }
    return this.insertNonTxnDirective(d, rawText, updatedAt, createdAt, forcedId)
  }

  private insertTransactionRow(
    input: TransactionInput,
    rawText: string,
    updatedAt: number,
    createdAt: number,
    forcedId?: number,
  ): number | null {
    const idCol = forcedId != null ? 'id, ' : ''
    const idVal = forcedId != null ? '?, ' : ''
    const baseArgs = [
      dateToInt(input.date),
      input.flag ?? null,
      input.payee ?? '',
      input.narration ?? '',
      JSON.stringify(input.meta ?? {}),
      rawText,
      createdAt,
      updatedAt,
    ] as const
    const args = forcedId != null ? [forcedId, ...baseArgs] : baseArgs
    const r = this.sql
      .exec<{ id: number }>(
        `INSERT INTO transactions_v2
           (${idCol}date, flag, payee, narration, meta_json, raw_text, created_at, updated_at)
         VALUES (${idVal}?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        ...args,
      )
      .toArray()[0]
    return r?.id ?? null
  }

  private insertNonTxnDirective(
    d: Exclude<DirectiveInput, { kind: 'transaction' }>,
    rawText: string,
    updatedAt: number,
    createdAt: number,
    forcedId?: number,
  ): number | null {
    const dateInt = dateToInt(d.input.date)
    const meta = JSON.stringify(d.input.meta ?? {})
    const idCol = forcedId != null ? 'id, ' : ''
    const idVal = forcedId != null ? '?, ' : ''
    const idArgs: SqlStorageValue[] = forcedId != null ? [forcedId] : []
    const tail: SqlStorageValue[] = [meta, rawText, createdAt, updatedAt]
    switch (d.kind) {
      case 'open': {
        const i = d.input
        const row = this.sql
          .exec<{ id: number }>(
            `INSERT INTO directives_open (${idCol}date, account, booking_method, constraint_currencies, meta_json, raw_text, created_at, updated_at)
             VALUES (${idVal}?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            ...idArgs,
            dateInt,
            i.account,
            i.booking_method ?? null,
            JSON.stringify(i.constraint_currencies ?? []),
            ...tail,
          )
          .toArray()[0]
        return row?.id ?? null
      }
      case 'close': {
        const i = d.input
        const row = this.sql
          .exec<{ id: number }>(
            `INSERT INTO directives_close (${idCol}date, account, meta_json, raw_text, created_at, updated_at)
             VALUES (${idVal}?, ?, ?, ?, ?, ?) RETURNING id`,
            ...idArgs,
            dateInt,
            i.account,
            ...tail,
          )
          .toArray()[0]
        return row?.id ?? null
      }
      case 'commodity': {
        const i = d.input
        const row = this.sql
          .exec<{ id: number }>(
            `INSERT INTO directives_commodity (${idCol}date, currency, meta_json, raw_text, created_at, updated_at)
             VALUES (${idVal}?, ?, ?, ?, ?, ?) RETURNING id`,
            ...idArgs,
            dateInt,
            i.currency,
            ...tail,
          )
          .toArray()[0]
        return row?.id ?? null
      }
      case 'balance': {
        const i = d.input
        const amt = scaleDecimal(i.amount)
        const row = this.sql
          .exec<{ id: number }>(
            `INSERT INTO directives_balance (${idCol}date, account, amount, amount_scaled, scale, currency, meta_json, raw_text, created_at, updated_at)
             VALUES (${idVal}?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            ...idArgs,
            dateInt,
            i.account,
            i.amount,
            amt.scaled,
            amt.scale,
            i.currency,
            ...tail,
          )
          .toArray()[0]
        return row?.id ?? null
      }
      case 'pad': {
        const i = d.input
        const row = this.sql
          .exec<{ id: number }>(
            `INSERT INTO directives_pad (${idCol}date, account, account_pad, meta_json, raw_text, created_at, updated_at)
             VALUES (${idVal}?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            ...idArgs,
            dateInt,
            i.account,
            i.account_pad,
            ...tail,
          )
          .toArray()[0]
        return row?.id ?? null
      }
      case 'price': {
        const i = d.input
        const amt = scaleDecimal(i.amount)
        const row = this.sql
          .exec<{ id: number }>(
            `INSERT INTO directives_price (${idCol}date, commodity, currency, amount, amount_scaled, scale, meta_json, raw_text, created_at, updated_at)
             VALUES (${idVal}?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            ...idArgs,
            dateInt,
            i.commodity,
            i.currency,
            i.amount,
            amt.scaled,
            amt.scale,
            ...tail,
          )
          .toArray()[0]
        return row?.id ?? null
      }
      case 'note': {
        const i = d.input
        const row = this.sql
          .exec<{ id: number }>(
            `INSERT INTO directives_note (${idCol}date, account, description, meta_json, raw_text, created_at, updated_at)
             VALUES (${idVal}?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            ...idArgs,
            dateInt,
            i.account,
            i.description,
            ...tail,
          )
          .toArray()[0]
        return row?.id ?? null
      }
      case 'document': {
        const i = d.input
        const row = this.sql
          .exec<{ id: number }>(
            `INSERT INTO directives_document (${idCol}date, account, filename, meta_json, raw_text, created_at, updated_at)
             VALUES (${idVal}?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            ...idArgs,
            dateInt,
            i.account,
            i.filename,
            ...tail,
          )
          .toArray()[0]
        return row?.id ?? null
      }
      case 'event': {
        const i = d.input
        const row = this.sql
          .exec<{ id: number }>(
            `INSERT INTO directives_event (${idCol}date, name, value, meta_json, raw_text, created_at, updated_at)
             VALUES (${idVal}?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            ...idArgs,
            dateInt,
            i.name,
            i.value,
            ...tail,
          )
          .toArray()[0]
        return row?.id ?? null
      }
    }
  }

  private deleteDirectiveRow(kind: DirectiveKind, id: number): void {
    const table = directiveTable(kind)
    this.sql.exec(`DELETE FROM ${table} WHERE id = ?`, id)
  }

  private readDirective(kind: DirectiveKind, id: number): DirectiveV2 | null {
    if (kind === 'transaction') {
      const t = this.readV2Transaction(id)
      return t ? ({ ...t, kind: 'transaction' } as DirectiveTransaction) : null
    }
    return this.readNonTxnDirective(kind, id)
  }

  private readNonTxnDirective(kind: DirectiveKind, id: number): DirectiveV2 | null {
    switch (kind) {
      case 'open': {
        const r = this.sql
          .exec<{
            id: number
            date: number
            account: string
            booking_method: string | null
            constraint_currencies: string
            meta_json: string
            raw_text: string
            created_at: number
            updated_at: number
          }>(`SELECT * FROM directives_open WHERE id = ?`, id)
          .toArray()[0]
        if (!r) return null
        return {
          kind: 'open',
          id: r.id,
          date: dateFromInt(r.date),
          account: r.account,
          booking_method: r.booking_method,
          constraint_currencies: parseStringArray(r.constraint_currencies),
          meta: parseMeta(r.meta_json),
          raw_text: r.raw_text,
          created_at: r.created_at,
          updated_at: r.updated_at,
        } satisfies DirectiveOpen
      }
      case 'close': {
        const r = this.sql
          .exec<{
            id: number
            date: number
            account: string
            meta_json: string
            raw_text: string
            created_at: number
            updated_at: number
          }>(`SELECT * FROM directives_close WHERE id = ?`, id)
          .toArray()[0]
        if (!r) return null
        return {
          kind: 'close',
          id: r.id,
          date: dateFromInt(r.date),
          account: r.account,
          meta: parseMeta(r.meta_json),
          raw_text: r.raw_text,
          created_at: r.created_at,
          updated_at: r.updated_at,
        } satisfies DirectiveClose
      }
      case 'commodity': {
        const r = this.sql
          .exec<{
            id: number
            date: number
            currency: string
            meta_json: string
            raw_text: string
            created_at: number
            updated_at: number
          }>(`SELECT * FROM directives_commodity WHERE id = ?`, id)
          .toArray()[0]
        if (!r) return null
        return {
          kind: 'commodity',
          id: r.id,
          date: dateFromInt(r.date),
          currency: r.currency,
          meta: parseMeta(r.meta_json),
          raw_text: r.raw_text,
          created_at: r.created_at,
          updated_at: r.updated_at,
        } satisfies DirectiveCommodity
      }
      case 'balance': {
        const r = this.sql
          .exec<{
            id: number
            date: number
            account: string
            amount: string
            currency: string
            meta_json: string
            raw_text: string
            created_at: number
            updated_at: number
          }>(`SELECT * FROM directives_balance WHERE id = ?`, id)
          .toArray()[0]
        if (!r) return null
        return {
          kind: 'balance',
          id: r.id,
          date: dateFromInt(r.date),
          account: r.account,
          amount: r.amount,
          currency: r.currency,
          meta: parseMeta(r.meta_json),
          raw_text: r.raw_text,
          created_at: r.created_at,
          updated_at: r.updated_at,
        } satisfies DirectiveBalance
      }
      case 'pad': {
        const r = this.sql
          .exec<{
            id: number
            date: number
            account: string
            account_pad: string
            meta_json: string
            raw_text: string
            created_at: number
            updated_at: number
          }>(`SELECT * FROM directives_pad WHERE id = ?`, id)
          .toArray()[0]
        if (!r) return null
        return {
          kind: 'pad',
          id: r.id,
          date: dateFromInt(r.date),
          account: r.account,
          account_pad: r.account_pad,
          meta: parseMeta(r.meta_json),
          raw_text: r.raw_text,
          created_at: r.created_at,
          updated_at: r.updated_at,
        } satisfies DirectivePad
      }
      case 'price': {
        const r = this.sql
          .exec<{
            id: number
            date: number
            commodity: string
            currency: string
            amount: string
            meta_json: string
            raw_text: string
            created_at: number
            updated_at: number
          }>(`SELECT * FROM directives_price WHERE id = ?`, id)
          .toArray()[0]
        if (!r) return null
        return {
          kind: 'price',
          id: r.id,
          date: dateFromInt(r.date),
          commodity: r.commodity,
          currency: r.currency,
          amount: r.amount,
          meta: parseMeta(r.meta_json),
          raw_text: r.raw_text,
          created_at: r.created_at,
          updated_at: r.updated_at,
        } satisfies DirectivePrice
      }
      case 'note': {
        const r = this.sql
          .exec<{
            id: number
            date: number
            account: string
            description: string
            meta_json: string
            raw_text: string
            created_at: number
            updated_at: number
          }>(`SELECT * FROM directives_note WHERE id = ?`, id)
          .toArray()[0]
        if (!r) return null
        return {
          kind: 'note',
          id: r.id,
          date: dateFromInt(r.date),
          account: r.account,
          description: r.description,
          meta: parseMeta(r.meta_json),
          raw_text: r.raw_text,
          created_at: r.created_at,
          updated_at: r.updated_at,
        } satisfies DirectiveNote
      }
      case 'document': {
        const r = this.sql
          .exec<{
            id: number
            date: number
            account: string
            filename: string
            meta_json: string
            raw_text: string
            created_at: number
            updated_at: number
          }>(`SELECT * FROM directives_document WHERE id = ?`, id)
          .toArray()[0]
        if (!r) return null
        return {
          kind: 'document',
          id: r.id,
          date: dateFromInt(r.date),
          account: r.account,
          filename: r.filename,
          meta: parseMeta(r.meta_json),
          raw_text: r.raw_text,
          created_at: r.created_at,
          updated_at: r.updated_at,
        } satisfies DirectiveDocument
      }
      case 'event': {
        const r = this.sql
          .exec<{
            id: number
            date: number
            name: string
            value: string
            meta_json: string
            raw_text: string
            created_at: number
            updated_at: number
          }>(`SELECT * FROM directives_event WHERE id = ?`, id)
          .toArray()[0]
        if (!r) return null
        return {
          kind: 'event',
          id: r.id,
          date: dateFromInt(r.date),
          name: r.name,
          value: r.value,
          meta: parseMeta(r.meta_json),
          raw_text: r.raw_text,
          created_at: r.created_at,
          updated_at: r.updated_at,
        } satisfies DirectiveEvent
      }
      case 'transaction':
        return null
    }
  }

  private insertV2Children(txnId: number, input: TransactionInput): void {
    const dateInt = dateToInt(input.date)
    for (let i = 0; i < input.postings.length; i++) {
      const p: PostingInput = input.postings[i]
      const amt = p.amount != null ? scaleDecimal(p.amount) : null
      const px = p.price_amount != null ? scaleDecimal(p.price_amount) : null
      this.sql.exec(
        `INSERT INTO postings
           (txn_id, idx, flag, account, amount, amount_scaled, scale,
            currency, cost_raw, price_at_signs,
            price_amount, price_amount_scaled, price_scale,
            price_currency, comment, meta_json, date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        txnId,
        i,
        p.flag ?? null,
        p.account,
        p.amount ?? null,
        amt?.scaled ?? null,
        amt?.scale ?? null,
        p.currency ?? null,
        p.cost_raw ?? null,
        p.price_at_signs ?? 0,
        p.price_amount ?? null,
        px?.scaled ?? null,
        px?.scale ?? null,
        p.price_currency ?? null,
        p.comment ?? null,
        JSON.stringify(p.meta ?? {}),
        dateInt,
      )
    }
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

  private readV2Transaction(id: number): TransactionV2 | null {
    const head = this.sql
      .exec<{
        id: number
        date: number
        flag: string | null
        payee: string
        narration: string
        meta_json: string
        raw_text: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, flag, payee, narration, meta_json, raw_text, created_at, updated_at
         FROM transactions_v2 WHERE id = ?`,
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
    const postings: PostingV2[] = postingRows.map((r) => ({
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
      id: head.id,
      date: dateFromInt(head.date),
      flag: (head.flag === '*' || head.flag === '!' ? head.flag : null) as '*' | '!' | null,
      payee: head.payee,
      narration: head.narration,
      postings,
      tags,
      links,
      meta: parseMeta(head.meta_json),
      raw_text: head.raw_text,
      created_at: head.created_at,
      updated_at: head.updated_at,
    }
  }
}

function prepareV2Input(
  input: TransactionInput,
): { ok: true; rawText: string } | { ok: false; errors: string[] } {
  const errors = validateInput(input)
  if (errors.length > 0) return { ok: false, errors }
  try {
    return { ok: true, rawText: serializeTransaction(buildTransactionAst(input)) }
  } catch (e) {
    return { ok: false, errors: [`serialize failed: ${String(e)}`] }
  }
}

function directiveTable(kind: DirectiveKind): string {
  switch (kind) {
    case 'transaction': return 'transactions_v2'
    case 'open': return 'directives_open'
    case 'close': return 'directives_close'
    case 'commodity': return 'directives_commodity'
    case 'balance': return 'directives_balance'
    case 'pad': return 'directives_pad'
    case 'price': return 'directives_price'
    case 'note': return 'directives_note'
    case 'document': return 'directives_document'
    case 'event': return 'directives_event'
  }
}

function parseStringArray(json: string): string[] {
  if (json === '[]' || json === '') return []
  try {
    const parsed = JSON.parse(json) as unknown
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string')
  } catch {}
  return []
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
