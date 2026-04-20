export const SCHEMA_STEPS: ReadonlyArray<readonly [label: string, sql: string]> = [
  [
    'transactions',
    `CREATE TABLE IF NOT EXISTS transactions (
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
    )`,
  ],
  [
    'idx_date_id',
    'CREATE INDEX IF NOT EXISTS idx_transactions_date_id ON transactions(date, id)',
  ],
  ['idx_flag', 'CREATE INDEX IF NOT EXISTS idx_transactions_flag ON transactions(flag)'],
  [
    'transactions_fts',
    `CREATE VIRTUAL TABLE IF NOT EXISTS transactions_fts USING fts5(
      t_payee, t_account, t_currency, t_tag, t_link,
      content='transactions', content_rowid='id',
      tokenize='unicode61'
    )`,
  ],
  [
    'trigger_ai',
    `CREATE TRIGGER IF NOT EXISTS transactions_ai AFTER INSERT ON transactions BEGIN
      INSERT INTO transactions_fts(rowid, t_payee, t_account, t_currency, t_tag, t_link)
      VALUES (new.id, new.t_payee, new.t_account, new.t_currency, new.t_tag, new.t_link);
    END`,
  ],
  [
    'trigger_ad',
    `CREATE TRIGGER IF NOT EXISTS transactions_ad AFTER DELETE ON transactions BEGIN
      INSERT INTO transactions_fts(transactions_fts, rowid, t_payee, t_account, t_currency, t_tag, t_link)
      VALUES ('delete', old.id, old.t_payee, old.t_account, old.t_currency, old.t_tag, old.t_link);
    END`,
  ],
  [
    'trigger_au',
    `CREATE TRIGGER IF NOT EXISTS transactions_au AFTER UPDATE ON transactions BEGIN
      INSERT INTO transactions_fts(transactions_fts, rowid, t_payee, t_account, t_currency, t_tag, t_link)
      VALUES ('delete', old.id, old.t_payee, old.t_account, old.t_currency, old.t_tag, old.t_link);
      INSERT INTO transactions_fts(rowid, t_payee, t_account, t_currency, t_tag, t_link)
      VALUES (new.id, new.t_payee, new.t_account, new.t_currency, new.t_tag, new.t_link);
    END`,
  ],
]
