import { DurableObject } from 'cloudflare:workers'

export interface Transaction extends Record<string, SqlStorageValue> {
  id: number
  raw_text: string
  tokens: string
  date: number | null
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
        date        INTEGER,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      )
    `)
    const cols = this.sql
      .exec<{ name: string }>("PRAGMA table_info(transactions)")
      .toArray()
      .map((r) => r.name)
    if (!cols.includes('tokens')) {
      this.sql.exec("ALTER TABLE transactions ADD COLUMN tokens TEXT NOT NULL DEFAULT ''")
    }
    if (!cols.includes('date')) {
      this.sql.exec('ALTER TABLE transactions ADD COLUMN date INTEGER')
    }
    this.sql.exec('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)')
  }

  async get(_id: number): Promise<Transaction | null> {
    return null
  }

  async create(_raw_text: string): Promise<Transaction | null> {
    return null
  }

  async update(_id: number, _raw_text: string): Promise<Transaction | null> {
    return null
  }

  async remove(_id: number): Promise<boolean> {
    return false
  }

  async exportAll(): Promise<Transaction[]> {
    return []
  }

  async importAll(_rows: Transaction[]): Promise<{ copied: number }> {
    return { copied: 0 }
  }
}
