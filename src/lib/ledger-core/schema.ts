export type SchemaStep = {
  label: string
  sql: string
  allowFail?: boolean
}

const RAW_TEXT_TABLES = [
  'transactions',
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

export const SCHEMA_STEPS: ReadonlyArray<SchemaStep> = [
  {
    label: 'transactions',
    sql: `CREATE TABLE IF NOT EXISTS transactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        INTEGER NOT NULL,
      flag        TEXT,
      payee       TEXT    NOT NULL DEFAULT '',
      narration   TEXT    NOT NULL DEFAULT '',
      meta_json   TEXT    NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    )`,
  },
  {
    label: 'idx_transactions_date_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_transactions_date_id ON transactions(date DESC, id DESC)',
  },
  {
    label: 'transactions_add_hash',
    sql: 'ALTER TABLE transactions ADD COLUMN hash TEXT',
    allowFail: true,
  },
  {
    label: 'idx_transactions_hash',
    sql: 'CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(hash)',
  },
  {
    label: 'postings',
    sql: `CREATE TABLE IF NOT EXISTS postings (
      txn_id              INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      idx                 INTEGER NOT NULL,
      flag                TEXT,
      account             TEXT    NOT NULL,
      amount              TEXT,
      amount_scaled       INTEGER,
      scale               INTEGER,
      currency            TEXT,
      cost_raw            TEXT,
      price_at_signs      INTEGER NOT NULL DEFAULT 0,
      price_amount        TEXT,
      price_amount_scaled INTEGER,
      price_scale         INTEGER,
      price_currency      TEXT,
      comment             TEXT,
      meta_json           TEXT NOT NULL DEFAULT '{}',
      date                INTEGER NOT NULL,
      PRIMARY KEY (txn_id, idx)
    )`,
  },
  {
    label: 'idx_postings_account_date',
    sql: 'CREATE INDEX IF NOT EXISTS idx_postings_account_date ON postings(account, date, txn_id, idx)',
  },
  {
    label: 'idx_postings_currency_date',
    sql: 'CREATE INDEX IF NOT EXISTS idx_postings_currency_date ON postings(currency, date)',
  },
  {
    label: 'txn_tags',
    sql: `CREATE TABLE IF NOT EXISTS txn_tags (
      txn_id     INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      tag        TEXT    NOT NULL,
      from_stack INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (txn_id, tag)
    )`,
  },
  {
    label: 'txn_links',
    sql: `CREATE TABLE IF NOT EXISTS txn_links (
      txn_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      link   TEXT    NOT NULL,
      PRIMARY KEY (txn_id, link)
    )`,
  },
  {
    label: 'directives_open',
    sql: `CREATE TABLE IF NOT EXISTS directives_open (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      date                  INTEGER NOT NULL,
      account               TEXT NOT NULL,
      booking_method        TEXT,
      constraint_currencies TEXT NOT NULL DEFAULT '[]',
      meta_json             TEXT NOT NULL DEFAULT '{}',
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL
    )`,
  },
  {
    label: 'directives_close',
    sql: `CREATE TABLE IF NOT EXISTS directives_close (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       INTEGER NOT NULL,
      account    TEXT NOT NULL,
      meta_json  TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  },
  {
    label: 'directives_commodity',
    sql: `CREATE TABLE IF NOT EXISTS directives_commodity (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       INTEGER NOT NULL,
      currency   TEXT NOT NULL,
      meta_json  TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  },
  {
    label: 'directives_balance',
    sql: `CREATE TABLE IF NOT EXISTS directives_balance (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      date          INTEGER NOT NULL,
      account       TEXT NOT NULL,
      amount        TEXT NOT NULL,
      amount_scaled INTEGER NOT NULL,
      scale         INTEGER NOT NULL,
      currency      TEXT NOT NULL,
      meta_json     TEXT NOT NULL DEFAULT '{}',
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    )`,
  },
  {
    label: 'directives_pad',
    sql: `CREATE TABLE IF NOT EXISTS directives_pad (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      date         INTEGER NOT NULL,
      account      TEXT NOT NULL,
      account_pad  TEXT NOT NULL,
      meta_json    TEXT NOT NULL DEFAULT '{}',
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    )`,
  },
  {
    label: 'directives_price',
    sql: `CREATE TABLE IF NOT EXISTS directives_price (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      date          INTEGER NOT NULL,
      commodity     TEXT NOT NULL,
      currency      TEXT NOT NULL,
      amount        TEXT NOT NULL,
      amount_scaled INTEGER NOT NULL,
      scale         INTEGER NOT NULL,
      meta_json     TEXT NOT NULL DEFAULT '{}',
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    )`,
  },
  {
    label: 'directives_note',
    sql: `CREATE TABLE IF NOT EXISTS directives_note (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        INTEGER NOT NULL,
      account     TEXT NOT NULL,
      description TEXT NOT NULL,
      meta_json   TEXT NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    )`,
  },
  {
    label: 'directives_document',
    sql: `CREATE TABLE IF NOT EXISTS directives_document (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       INTEGER NOT NULL,
      account    TEXT NOT NULL,
      filename   TEXT NOT NULL,
      meta_json  TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  },
  {
    label: 'directives_event',
    sql: `CREATE TABLE IF NOT EXISTS directives_event (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       INTEGER NOT NULL,
      name       TEXT NOT NULL,
      value      TEXT NOT NULL,
      meta_json  TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  },
  {
    label: 'idx_directives_open_date_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_directives_open_date_id ON directives_open(date DESC, id DESC)',
  },
  {
    label: 'idx_directives_close_date_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_directives_close_date_id ON directives_close(date DESC, id DESC)',
  },
  {
    label: 'idx_directives_commodity_date_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_directives_commodity_date_id ON directives_commodity(date DESC, id DESC)',
  },
  {
    label: 'idx_directives_balance_date_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_directives_balance_date_id ON directives_balance(date DESC, id DESC)',
  },
  {
    label: 'idx_directives_pad_date_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_directives_pad_date_id ON directives_pad(date DESC, id DESC)',
  },
  {
    label: 'idx_directives_price_date_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_directives_price_date_id ON directives_price(date DESC, id DESC)',
  },
  {
    label: 'idx_directives_note_date_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_directives_note_date_id ON directives_note(date DESC, id DESC)',
  },
  {
    label: 'idx_directives_document_date_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_directives_document_date_id ON directives_document(date DESC, id DESC)',
  },
  {
    label: 'idx_directives_event_date_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_directives_event_date_id ON directives_event(date DESC, id DESC)',
  },
  {
    label: 'drop_account_recents',
    sql: 'DROP TABLE IF EXISTS account_recents',
  },
  ...RAW_TEXT_TABLES.map((table) => ({
    label: `drop_raw_text_${table}`,
    sql: `ALTER TABLE ${table} DROP COLUMN raw_text`,
    allowFail: true,
  })),
]
