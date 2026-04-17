import { DurableObject } from 'cloudflare:workers'
import { extractTxn, type ExtractedTxn } from './beancount-extract'
import type { TransactionRow } from './ledger-types'

type BatchError = { index: number; errors: string[] }

const ROW_COLS =
  'id, raw_text, date, flag, t_payee, t_account, t_currency, t_tag, t_link, created_at, updated_at'

const SCHEMA_VERSION = 1

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
