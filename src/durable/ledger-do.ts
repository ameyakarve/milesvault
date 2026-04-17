import { DurableObject } from 'cloudflare:workers'

export interface Transaction extends Record<string, SqlStorageValue> {
  id: number
  raw_text: string
  tokens: string
  created_at: number
  updated_at: number
}

export function tokenize(raw_text: string): string[] {
  return raw_text.toLowerCase().split(/\s+/).filter(Boolean)
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
        tokens      TEXT    NOT NULL DEFAULT '',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      )
    `)
    const hasTokens = this.sql
      .exec<{ name: string }>("PRAGMA table_info(transactions)")
      .toArray()
      .some((r) => r.name === 'tokens')
    if (!hasTokens) {
      this.sql.exec("ALTER TABLE transactions ADD COLUMN tokens TEXT NOT NULL DEFAULT ''")
    }
  }

  async list(): Promise<Transaction[]> {
    return this.sql
      .exec<Transaction>(
        'SELECT id, raw_text, tokens, created_at, updated_at FROM transactions ORDER BY id',
      )
      .toArray()
  }

  async get(id: number): Promise<Transaction | null> {
    const row = this.sql
      .exec<Transaction>(
        'SELECT id, raw_text, tokens, created_at, updated_at FROM transactions WHERE id = ?',
        id,
      )
      .toArray()[0]
    return row ?? null
  }

  async create(raw_text: string): Promise<Transaction> {
    const now = Date.now()
    const tokens = tokenize(raw_text).join(' ')
    const row = this.sql
      .exec<Transaction>(
        'INSERT INTO transactions (raw_text, tokens, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id, raw_text, tokens, created_at, updated_at',
        raw_text,
        tokens,
        now,
        now,
      )
      .toArray()[0]
    return row
  }

  async update(id: number, raw_text: string): Promise<Transaction | null> {
    const now = Date.now()
    const tokens = tokenize(raw_text).join(' ')
    const row = this.sql
      .exec<Transaction>(
        'UPDATE transactions SET raw_text = ?, tokens = ?, updated_at = ? WHERE id = ? RETURNING id, raw_text, tokens, created_at, updated_at',
        raw_text,
        tokens,
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

  async exportAll(): Promise<Transaction[]> {
    return []
  }

  async importAll(_rows: Transaction[]): Promise<{ copied: number }> {
    return { copied: 0 }
  }
}
