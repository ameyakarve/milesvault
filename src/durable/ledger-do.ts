import { DurableObject } from 'cloudflare:workers'
import { extractTxn, type ExtractedTxn } from './beancount-extract'
import type {
  TransactionRow,
  BatchApplyInput,
  BatchApplyResult,
  BatchValidationError,
  BatchConflict,
} from './ledger-types'
import type { SearchFilter } from './search-parser'

type BatchError = { index: number; errors: string[] }

const ROW_COLS =
  'id, raw_text, date, flag, t_payee, t_account, t_currency, t_tag, t_link, created_at, updated_at'

const SCHEMA_VERSION = 1

function escapeFts(s: string): string {
  return s.replace(/"/g, '""')
}

export class LedgerDO extends DurableObject<CloudflareEnv> {
  private sql: SqlStorage

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    super(state, env)
    this.sql = state.storage.sql
    this.migrate()
  }

  private migrate(): void {
    const version =
      this.sql.exec<{ user_version: number }>('PRAGMA user_version').toArray()[0]?.user_version ??
      0
    if (version < SCHEMA_VERSION) {
      this.sql.exec('DROP TABLE IF EXISTS transactions_fts')
      this.sql.exec('DROP TABLE IF EXISTS transactions')
    }
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_text    TEXT    NOT NULL,
        date        INTEGER NOT NULL,
        flag        TEXT,
        t_payee     TEXT    NOT NULL DEFAULT '',
        t_account   TEXT    NOT NULL DEFAULT '',
        t_currency  TEXT    NOT NULL DEFAULT '',
        t_tag       TEXT    NOT NULL DEFAULT '',
        t_link      TEXT    NOT NULL DEFAULT '',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      )
    `)
    this.sql.exec(
      'CREATE INDEX IF NOT EXISTS idx_transactions_date_id ON transactions(date, id)',
    )
    this.sql.exec('CREATE INDEX IF NOT EXISTS idx_transactions_flag ON transactions(flag)')
    this.sql.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS transactions_fts USING fts5(
        t_payee, t_account, t_currency, t_tag, t_link,
        content='transactions', content_rowid='id',
        tokenize='unicode61'
      )
    `)
    this.sql.exec(`
      CREATE TRIGGER IF NOT EXISTS transactions_ai AFTER INSERT ON transactions BEGIN
        INSERT INTO transactions_fts(rowid, t_payee, t_account, t_currency, t_tag, t_link)
        VALUES (new.id, new.t_payee, new.t_account, new.t_currency, new.t_tag, new.t_link);
      END
    `)
    this.sql.exec(`
      CREATE TRIGGER IF NOT EXISTS transactions_ad AFTER DELETE ON transactions BEGIN
        INSERT INTO transactions_fts(transactions_fts, rowid, t_payee, t_account, t_currency, t_tag, t_link)
        VALUES ('delete', old.id, old.t_payee, old.t_account, old.t_currency, old.t_tag, old.t_link);
      END
    `)
    this.sql.exec(`
      CREATE TRIGGER IF NOT EXISTS transactions_au AFTER UPDATE ON transactions BEGIN
        INSERT INTO transactions_fts(transactions_fts, rowid, t_payee, t_account, t_currency, t_tag, t_link)
        VALUES ('delete', old.id, old.t_payee, old.t_account, old.t_currency, old.t_tag, old.t_link);
        INSERT INTO transactions_fts(rowid, t_payee, t_account, t_currency, t_tag, t_link)
        VALUES (new.id, new.t_payee, new.t_account, new.t_currency, new.t_tag, new.t_link);
      END
    `)
    if (version < SCHEMA_VERSION) {
      this.sql.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    }
  }

  async get(id: number): Promise<TransactionRow | null> {
    const row = this.sql
      .exec<TransactionRow>(
        `SELECT ${ROW_COLS} FROM transactions WHERE id = ?`,
        id,
      )
      .toArray()[0]
    return row ?? null
  }

  async search(
    filter: SearchFilter,
    limit: number,
    offset: number,
  ): Promise<{ rows: TransactionRow[]; total: number }> {
    const ftsTerms: string[] = []
    for (const t of filter.accountTokens) ftsTerms.push(`t_account:"${escapeFts(t)}"`)
    for (const t of filter.tagTokens) ftsTerms.push(`t_tag:"${escapeFts(t)}"`)
    for (const t of filter.linkTokens) ftsTerms.push(`t_link:"${escapeFts(t)}"`)
    for (const t of filter.freeTokens) ftsTerms.push(`"${escapeFts(t)}"`)
    const ftsQuery = ftsTerms.join(' ')

    const whereParts: string[] = []
    const params: SqlStorageValue[] = []
    if (ftsQuery.length > 0) {
      whereParts.push(
        't.id IN (SELECT rowid FROM transactions_fts WHERE transactions_fts MATCH ?)',
      )
      params.push(ftsQuery)
    }
    if (filter.dateFrom != null) {
      whereParts.push('t.date >= ?')
      params.push(filter.dateFrom)
    }
    if (filter.dateTo != null) {
      whereParts.push('t.date <= ?')
      params.push(filter.dateTo)
    }
    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''

    const countSql = `SELECT COUNT(*) AS c FROM transactions t ${whereSql}`
    const rowsSql = `SELECT ${ROW_COLS} FROM transactions t ${whereSql} ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?`
    let total = 0
    let rows: TransactionRow[] = []
    try {
      total =
        this.sql.exec<{ c: number }>(countSql, ...params).toArray()[0]?.c ?? 0
    } catch (e) {
      console.error('[search] count failed', { sql: countSql, params, err: String(e) })
      throw e
    }
    try {
      rows = this.sql
        .exec<TransactionRow>(rowsSql, ...params, limit, offset)
        .toArray()
    } catch (e) {
      console.error('[search] rows failed', {
        sql: rowsSql,
        params,
        limit,
        offset,
        err: String(e),
      })
      throw e
    }
    return { rows, total }
  }

  async create(
    raw_text: string,
  ): Promise<{ ok: true; row: TransactionRow } | { ok: false; errors: string[] }> {
    const trimmed = raw_text.trim()
    if (trimmed.length === 0) return { ok: false, errors: ['Empty input.'] }
    const result = extractTxn(trimmed)
    if (result.ok !== true) return { ok: false, errors: result.errors }
    const { date, flag, t_payee, t_account, t_currency, t_tag, t_link } = result.value
    const now = Date.now()
    const row = this.sql
      .exec<TransactionRow>(
        `INSERT INTO transactions
           (raw_text, date, flag, t_payee, t_account, t_currency, t_tag, t_link, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING ${ROW_COLS}`,
        trimmed,
        date,
        flag,
        t_payee,
        t_account,
        t_currency,
        t_tag,
        t_link,
        now,
        now,
      )
      .toArray()[0]
    return row ? { ok: true, row } : { ok: false, errors: ['Insert failed.'] }
  }

  async createBatch(
    raw_texts: string[],
  ): Promise<
    { ok: true; rows: TransactionRow[] } | { ok: false; errors: BatchError[] }
  > {
    const validated: { trimmed: string; extracted: ExtractedTxn }[] = []
    const errors: BatchError[] = []
    for (let i = 0; i < raw_texts.length; i++) {
      const trimmed = raw_texts[i].trim()
      if (trimmed.length === 0) {
        errors.push({ index: i, errors: ['Empty input.'] })
        continue
      }
      const result = extractTxn(trimmed)
      if (result.ok !== true) {
        errors.push({ index: i, errors: result.errors })
        continue
      }
      validated.push({ trimmed, extracted: result.value })
    }
    if (errors.length > 0) return { ok: false, errors }

    const rows: TransactionRow[] = []
    this.ctx.storage.transactionSync(() => {
      const now = Date.now()
      for (const { trimmed, extracted } of validated) {
        const { date, flag, t_payee, t_account, t_currency, t_tag, t_link } = extracted
        const row = this.sql
          .exec<TransactionRow>(
            `INSERT INTO transactions
               (raw_text, date, flag, t_payee, t_account, t_currency, t_tag, t_link, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             RETURNING ${ROW_COLS}`,
            trimmed,
            date,
            flag,
            t_payee,
            t_account,
            t_currency,
            t_tag,
            t_link,
            now,
            now,
          )
          .toArray()[0]
        if (row) rows.push(row)
      }
    })
    return { ok: true, rows }
  }

  async applyBatch(input: BatchApplyInput): Promise<BatchApplyResult> {
    const updates = input.updates ?? []
    const creates = input.creates ?? []
    const deletes = input.deletes ?? []

    const seenIds = new Set<number>()
    const requestErrors: string[] = []
    for (const u of updates) {
      if (seenIds.has(u.id)) requestErrors.push(`Duplicate id ${u.id} in updates/deletes.`)
      seenIds.add(u.id)
    }
    for (const d of deletes) {
      if (seenIds.has(d.id)) requestErrors.push(`Duplicate id ${d.id} in updates/deletes.`)
      seenIds.add(d.id)
    }
    if (requestErrors.length > 0) {
      return {
        ok: false,
        kind: 'validation',
        errors: [{ section: 'request', index: -1, errors: requestErrors }],
      }
    }

    const validationErrors: BatchValidationError[] = []
    const parsedUpdates: {
      id: number
      expected_updated_at: number
      trimmed: string
      extracted: ExtractedTxn
    }[] = []
    const parsedCreates: { trimmed: string; extracted: ExtractedTxn }[] = []

    for (let i = 0; i < updates.length; i++) {
      const u = updates[i]
      const trimmed = u.raw_text.trim()
      if (trimmed.length === 0) {
        validationErrors.push({ section: 'updates', index: i, errors: ['Empty input.'] })
        continue
      }
      const result = extractTxn(trimmed)
      if (result.ok !== true) {
        validationErrors.push({ section: 'updates', index: i, errors: result.errors })
        continue
      }
      parsedUpdates.push({
        id: u.id,
        expected_updated_at: u.expected_updated_at,
        trimmed,
        extracted: result.value,
      })
    }
    for (let i = 0; i < creates.length; i++) {
      const c = creates[i]
      const trimmed = c.raw_text.trim()
      if (trimmed.length === 0) {
        validationErrors.push({ section: 'creates', index: i, errors: ['Empty input.'] })
        continue
      }
      const result = extractTxn(trimmed)
      if (result.ok !== true) {
        validationErrors.push({ section: 'creates', index: i, errors: result.errors })
        continue
      }
      parsedCreates.push({ trimmed, extracted: result.value })
    }
    if (validationErrors.length > 0) {
      return { ok: false, kind: 'validation', errors: validationErrors }
    }

    const conflicts: BatchConflict[] = []
    for (let i = 0; i < parsedUpdates.length; i++) {
      const u = parsedUpdates[i]
      const current = this.sql
        .exec<{ updated_at: number }>(
          'SELECT updated_at FROM transactions WHERE id = ?',
          u.id,
        )
        .toArray()[0]
      if (!current || current.updated_at !== u.expected_updated_at) {
        conflicts.push({
          section: 'updates',
          index: i,
          id: u.id,
          expected_updated_at: u.expected_updated_at,
          current_updated_at: current?.updated_at ?? null,
        })
      }
    }
    for (let i = 0; i < deletes.length; i++) {
      const d = deletes[i]
      const current = this.sql
        .exec<{ updated_at: number }>(
          'SELECT updated_at FROM transactions WHERE id = ?',
          d.id,
        )
        .toArray()[0]
      if (!current || current.updated_at !== d.expected_updated_at) {
        conflicts.push({
          section: 'deletes',
          index: i,
          id: d.id,
          expected_updated_at: d.expected_updated_at,
          current_updated_at: current?.updated_at ?? null,
        })
      }
    }
    if (conflicts.length > 0) return { ok: false, kind: 'conflict', conflicts }

    const updated: TransactionRow[] = []
    const created: TransactionRow[] = []
    const deleted: number[] = []

    this.ctx.storage.transactionSync(() => {
      const now = Date.now()
      for (const d of deletes) {
        const row = this.sql
          .exec<{ id: number }>('DELETE FROM transactions WHERE id = ? RETURNING id', d.id)
          .toArray()[0]
        if (row) deleted.push(row.id)
      }
      for (const u of parsedUpdates) {
        const { date, flag, t_payee, t_account, t_currency, t_tag, t_link } = u.extracted
        const row = this.sql
          .exec<TransactionRow>(
            `UPDATE transactions SET
               raw_text = ?, date = ?, flag = ?,
               t_payee = ?, t_account = ?, t_currency = ?, t_tag = ?, t_link = ?,
               updated_at = max(?, updated_at + 1)
             WHERE id = ?
             RETURNING ${ROW_COLS}`,
            u.trimmed,
            date,
            flag,
            t_payee,
            t_account,
            t_currency,
            t_tag,
            t_link,
            now,
            u.id,
          )
          .toArray()[0]
        if (row) updated.push(row)
      }
      for (const c of parsedCreates) {
        const { date, flag, t_payee, t_account, t_currency, t_tag, t_link } = c.extracted
        const row = this.sql
          .exec<TransactionRow>(
            `INSERT INTO transactions
               (raw_text, date, flag, t_payee, t_account, t_currency, t_tag, t_link, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             RETURNING ${ROW_COLS}`,
            c.trimmed,
            date,
            flag,
            t_payee,
            t_account,
            t_currency,
            t_tag,
            t_link,
            now,
            now,
          )
          .toArray()[0]
        if (row) created.push(row)
      }
    })

    return { ok: true, updated, created, deleted }
  }

  async update(_id: number, _raw_text: string): Promise<TransactionRow | null> {
    return null
  }

  async remove(id: number): Promise<boolean> {
    const deleted = this.sql
      .exec<{ id: number }>('DELETE FROM transactions WHERE id = ? RETURNING id', id)
      .toArray()
    return deleted.length > 0
  }

  async exportAll(): Promise<TransactionRow[]> {
    return []
  }

  async importAll(_rows: TransactionRow[]): Promise<{ copied: number }> {
    return { copied: 0 }
  }
}
