import { DurableObject } from 'cloudflare:workers'

export interface Txn extends Record<string, SqlStorageValue> {
  id: number
  raw_text: string
  created_at: number
  updated_at: number
}

export class LedgerDO extends DurableObject<CloudflareEnv> {
  private sql: SqlStorage

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    super(state, env)
    this.sql = state.storage.sql
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_text    TEXT    NOT NULL,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      )
    `)
  }

  async list(): Promise<Txn[]> {
    return this.sql
      .exec<Txn>('SELECT id, raw_text, created_at, updated_at FROM transactions ORDER BY id')
      .toArray()
  }

  async get(id: number): Promise<Txn | null> {
    const row = this.sql
      .exec<Txn>('SELECT id, raw_text, created_at, updated_at FROM transactions WHERE id = ?', id)
      .toArray()[0]
    return row ?? null
  }

  async create(raw_text: string): Promise<Txn> {
    const now = Date.now()
    const row = this.sql
      .exec<Txn>(
        'INSERT INTO transactions (raw_text, created_at, updated_at) VALUES (?, ?, ?) RETURNING id, raw_text, created_at, updated_at',
        raw_text,
        now,
        now,
      )
      .toArray()[0]
    return row
  }

  async update(id: number, raw_text: string): Promise<Txn | null> {
    const now = Date.now()
    const row = this.sql
      .exec<Txn>(
        'UPDATE transactions SET raw_text = ?, updated_at = ? WHERE id = ? RETURNING id, raw_text, created_at, updated_at',
        raw_text,
        now,
        id,
      )
      .toArray()[0]
    return row ?? null
  }

  async remove(id: number): Promise<boolean> {
    this.sql.exec('DELETE FROM transactions WHERE id = ?', id)
    return true
  }
}
