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
