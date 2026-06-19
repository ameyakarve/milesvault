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
      account             TEXT    NOT NULL CHECK (length(account) > 0),
      amount              TEXT    NOT NULL CHECK (length(amount) > 0),
      amount_scaled       INTEGER NOT NULL,
      scale               INTEGER NOT NULL CHECK (scale >= 0 AND scale <= 18),
      currency            TEXT    NOT NULL CHECK (length(currency) > 0),
      cost_raw            TEXT,
      price_at_signs      INTEGER NOT NULL DEFAULT 0,
      price_amount        TEXT,
      price_amount_scaled INTEGER,
      price_scale         INTEGER,
      price_currency      TEXT,
      comment             TEXT,
      meta_json           TEXT NOT NULL DEFAULT '{}',
      date                INTEGER NOT NULL CHECK (date >= 19000101 AND date <= 21001231),
      PRIMARY KEY (txn_id, idx),
      CHECK (amount_scaled = 0 OR (substr(amount, 1, 1) = '-') = (amount_scaled < 0))
    ) STRICT`,
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
  {
    label: 'capture_items_add_prompt',
    sql: 'ALTER TABLE capture_items ADD COLUMN prompt TEXT',
    allowFail: true,
  },
  // Async ingestion (owner call): the background statement agent stores its
  // proposed entries here (JSON array of beancount strings); the Inbox
  // renders them for review. state moves captured -> extracted when set.
  {
    label: 'capture_items_drafts',
    sql: 'ALTER TABLE capture_items ADD COLUMN drafts TEXT',
    allowFail: true,
  },
  // Why the last background draft produced nothing (shown in the Inbox).
  {
    label: 'capture_items_draft_error',
    sql: 'ALTER TABLE capture_items ADD COLUMN draft_error TEXT',
    allowFail: true,
  },
  // Email automation log (experience.md §9): one row per inbound email,
  // whatever the outcome — the answer to "what did the robot do while I was
  // away". body_excerpt feeds the playground's replay.
  {
    label: 'ingest_log',
    sql: `CREATE TABLE IF NOT EXISTS ingest_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_addr    TEXT,
      subject      TEXT,
      outcome      TEXT NOT NULL,
      rule_id      INTEGER,
      capture_id   TEXT,
      body_excerpt TEXT,
      created_at   INTEGER NOT NULL
    ) STRICT`,
  },
  // Event-sourcing experiment (June 2026) — reversed: the beancount journal
  // is the single source of truth; no event log. Drop the short-lived tables.
  { label: 'drop_event_log', sql: 'DROP TABLE IF EXISTS event_log' },
  { label: 'drop_meta', sql: 'DROP TABLE IF EXISTS meta' },
  // Capture items (ledger-pipeline.md §2): one row per thing that arrived
  // from a source, in a lifecycle state. Statement uploads write here today;
  // email/paste captures join as those sources land.
  {
    label: 'capture_items',
    sql: `CREATE TABLE IF NOT EXISTS capture_items (
      id         TEXT PRIMARY KEY,
      source     TEXT NOT NULL,
      artifact   TEXT,
      filename   TEXT,
      state      TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT`,
  },
  ...RAW_TEXT_TABLES.map((table) => ({
    label: `drop_raw_text_${table}`,
    sql: `ALTER TABLE ${table} DROP COLUMN raw_text`,
    allowFail: true,
  })),
  {
    label: 'agent_proposals',
    sql: `CREATE TABLE IF NOT EXISTS agent_proposals (
      id              TEXT PRIMARY KEY,
      created_at      INTEGER NOT NULL,
      instruction     TEXT    NOT NULL,
      proposed_text   TEXT    NOT NULL,
      target_txn_ids  TEXT    NOT NULL DEFAULT '[]',
      status          TEXT    NOT NULL DEFAULT 'pending'
    )`,
  },
  // Transient statement-blob storage. POST /api/statements stashes the
  // extracted PDF text here keyed by a minted STMT-<uuid>; the chat agent's
  // ChatDO reads it back over RPC via get_statement when the statement
  // specialist calls read_statement. The DO is keyed per-user, so ownership is
  // already scoped by routing; owner_email is kept for record-keeping only.
  {
    label: 'statements',
    sql: `CREATE TABLE IF NOT EXISTS statements (
      id          TEXT    PRIMARY KEY,
      owner_email TEXT    NOT NULL,
      filename    TEXT    NOT NULL,
      text        TEXT    NOT NULL,
      created_at  INTEGER NOT NULL
    )`,
  },
  {
    label: 'statements_images',
    sql: 'ALTER TABLE statements ADD COLUMN images TEXT',
    allowFail: true,
  },
  {
    // One row per page image — a single statement's images blob exceeds
    // DO SQLite's ~2MB per-value cap (SQLITE_TOOBIG), so store them split.
    label: 'statement_images',
    sql: `CREATE TABLE IF NOT EXISTS statement_images (
      statement_id TEXT NOT NULL,
      idx          INTEGER NOT NULL,
      data_url     TEXT NOT NULL,
      PRIMARY KEY (statement_id, idx)
    )`,
  },
  {
    label: 'agent_attachments',
    sql: `CREATE TABLE IF NOT EXISTS agent_attachments (
      r2_key      TEXT    PRIMARY KEY,
      sha256      TEXT    NOT NULL,
      filename    TEXT    NOT NULL,
      mime        TEXT    NOT NULL,
      size        INTEGER NOT NULL,
      uploaded_at INTEGER NOT NULL
    )`,
  },
  {
    label: 'drop_agent_attachments',
    sql: 'DROP TABLE IF EXISTS agent_attachments',
  },
  {
    label: 'directives_balance_add_plug_account',
    sql: 'ALTER TABLE directives_balance ADD COLUMN plug_account TEXT',
    allowFail: true,
  },
  {
    label: 'drop_directives_pad',
    sql: 'DROP TABLE IF EXISTS directives_pad',
  },
  // Materialized balance tables. Source of truth is `postings`; these two are
  // pure derived state maintained by AFTER INSERT / AFTER DELETE triggers on
  // postings. The transactions → postings cascade fires the DELETE triggers
  // automatically, so replaceBuffer's batched writes never need to touch these
  // tables directly. Both are rebuildable from postings via
  //
  // `balance_totals` — one row per (account, currency, scale); current
  // cumulative balance. Hot path for "list all accounts with their current
  // balance" reads.
  //
  // `daily_balances` — sparse per active date; cumulative balance through
  // end-of-day. Hot path for balance_at(date) reads: latest row ≤ D for the
  // key is the answer. Backdating a posting fans out across all later active
  // days for that key; bounded by O(distinct active days since posting.date).
  {
    label: 'balance_totals',
    sql: `CREATE TABLE IF NOT EXISTS balance_totals (
      account        TEXT    NOT NULL,
      currency       TEXT    NOT NULL,
      scale          INTEGER NOT NULL,
      balance_scaled INTEGER NOT NULL,
      PRIMARY KEY (account, currency, scale)
    ) STRICT`,
  },
  {
    label: 'daily_balances',
    sql: `CREATE TABLE IF NOT EXISTS daily_balances (
      account        TEXT    NOT NULL,
      currency       TEXT    NOT NULL,
      scale          INTEGER NOT NULL,
      date           INTEGER NOT NULL,
      balance_scaled INTEGER NOT NULL,
      PRIMARY KEY (account, currency, scale, date)
    ) STRICT`,
  },
  {
    label: 'idx_daily_balances_lookup',
    sql: 'CREATE INDEX IF NOT EXISTS idx_daily_balances_lookup ON daily_balances(account, currency, scale, date DESC)',
  },
  // Triggers. replaceBuffer only INSERTs and DELETEs postings (it never
  // UPDATEs — edits are realized as delete+insert against the knownIds set),
  // so we intentionally skip AFTER UPDATE. If posting UPDATEs ever land, the
  // tables will silently drift — add the third trigger then.
  {
    label: 'trg_postings_balance_ai',
    sql: `CREATE TRIGGER IF NOT EXISTS trg_postings_balance_ai
          AFTER INSERT ON postings
          BEGIN
            INSERT INTO balance_totals (account, currency, scale, balance_scaled)
            VALUES (NEW.account, NEW.currency, NEW.scale, NEW.amount_scaled)
            ON CONFLICT(account, currency, scale) DO UPDATE SET
              balance_scaled = balance_scaled + NEW.amount_scaled;
          END`,
  },
  {
    label: 'trg_postings_balance_ad',
    sql: `CREATE TRIGGER IF NOT EXISTS trg_postings_balance_ad
          AFTER DELETE ON postings
          BEGIN
            UPDATE balance_totals
               SET balance_scaled = balance_scaled - OLD.amount_scaled
             WHERE account = OLD.account
               AND currency = OLD.currency
               AND scale = OLD.scale;
          END`,
  },
  {
    label: 'trg_postings_daily_ai',
    sql: `CREATE TRIGGER IF NOT EXISTS trg_postings_daily_ai
          AFTER INSERT ON postings
          BEGIN
            INSERT OR IGNORE INTO daily_balances (account, currency, scale, date, balance_scaled)
            SELECT NEW.account, NEW.currency, NEW.scale, NEW.date,
                   COALESCE((
                     SELECT balance_scaled FROM daily_balances
                      WHERE account = NEW.account
                        AND currency = NEW.currency
                        AND scale = NEW.scale
                        AND date < NEW.date
                      ORDER BY date DESC LIMIT 1
                   ), 0);
            UPDATE daily_balances
               SET balance_scaled = balance_scaled + NEW.amount_scaled
             WHERE account = NEW.account
               AND currency = NEW.currency
               AND scale = NEW.scale
               AND date >= NEW.date;
          END`,
  },
  {
    label: 'trg_postings_daily_ad',
    sql: `CREATE TRIGGER IF NOT EXISTS trg_postings_daily_ad
          AFTER DELETE ON postings
          BEGIN
            UPDATE daily_balances
               SET balance_scaled = balance_scaled - OLD.amount_scaled
             WHERE account = OLD.account
               AND currency = OLD.currency
               AND scale = OLD.scale
               AND date >= OLD.date;
          END`,
  },
  // Synthetic reconciling postings materialized from balance directives
  // with a plug_account (the pad): two rows per directive — the gap into
  // the asserted account, its mirror into the plug. Stored at scale 12
  // (TARGET_SCALE); readers already sum across scales. CASCADE keeps them
  // exactly as alive as their directive; rematerializePlugs() rebuilds the
  // whole table on every journal write.
  {
    label: 'plug_postings',
    sql: `CREATE TABLE IF NOT EXISTS plug_postings (
      directive_id   INTEGER NOT NULL REFERENCES directives_balance(id) ON DELETE CASCADE,
      account        TEXT    NOT NULL,
      amount_scaled  INTEGER NOT NULL,
      scale          INTEGER NOT NULL,
      currency       TEXT    NOT NULL,
      date           INTEGER NOT NULL
    ) STRICT`,
  },
  {
    label: 'trg_plugs_balance_ai',
    sql: `CREATE TRIGGER IF NOT EXISTS trg_plugs_balance_ai
          AFTER INSERT ON plug_postings
          BEGIN
            INSERT INTO balance_totals (account, currency, scale, balance_scaled)
            VALUES (NEW.account, NEW.currency, NEW.scale, NEW.amount_scaled)
            ON CONFLICT(account, currency, scale) DO UPDATE SET
              balance_scaled = balance_scaled + NEW.amount_scaled;
          END`,
  },
  {
    label: 'trg_plugs_balance_ad',
    sql: `CREATE TRIGGER IF NOT EXISTS trg_plugs_balance_ad
          AFTER DELETE ON plug_postings
          BEGIN
            UPDATE balance_totals
               SET balance_scaled = balance_scaled - OLD.amount_scaled
             WHERE account = OLD.account
               AND currency = OLD.currency
               AND scale = OLD.scale;
          END`,
  },
  {
    label: 'trg_plugs_daily_ai',
    sql: `CREATE TRIGGER IF NOT EXISTS trg_plugs_daily_ai
          AFTER INSERT ON plug_postings
          BEGIN
            INSERT OR IGNORE INTO daily_balances (account, currency, scale, date, balance_scaled)
            SELECT NEW.account, NEW.currency, NEW.scale, NEW.date,
                   COALESCE((
                     SELECT balance_scaled FROM daily_balances
                      WHERE account = NEW.account
                        AND currency = NEW.currency
                        AND scale = NEW.scale
                        AND date < NEW.date
                      ORDER BY date DESC LIMIT 1
                   ), 0);
            UPDATE daily_balances
               SET balance_scaled = balance_scaled + NEW.amount_scaled
             WHERE account = NEW.account
               AND currency = NEW.currency
               AND scale = NEW.scale
               AND date >= NEW.date;
          END`,
  },
  {
    label: 'trg_plugs_daily_ad',
    sql: `CREATE TRIGGER IF NOT EXISTS trg_plugs_daily_ad
          AFTER DELETE ON plug_postings
          BEGIN
            UPDATE daily_balances
               SET balance_scaled = balance_scaled - OLD.amount_scaled
             WHERE account = OLD.account
               AND currency = OLD.currency
               AND scale = OLD.scale
               AND date >= OLD.date;
          END`,
  },
  // ONE-TIME backfill (owner call: correctness is maintained on save by the
  // triggers — init only seeds a table that has never been derived, e.g.
  // right after the table is introduced to an existing journal).
  {
    label: 'balance_totals_backfill_once',
    sql: `INSERT INTO balance_totals (account, currency, scale, balance_scaled)
          SELECT account, currency, scale, SUM(amount_scaled)
          FROM (
            SELECT account, currency, scale, amount_scaled FROM postings
            UNION ALL
            SELECT account, currency, scale, amount_scaled FROM plug_postings
          )
          WHERE (SELECT COUNT(*) FROM balance_totals) = 0
          GROUP BY account, currency, scale`,
  },
  {
    label: 'daily_balances_backfill_once',
    sql: `INSERT INTO daily_balances (account, currency, scale, date, balance_scaled)
          SELECT account, currency, scale, date,
                 SUM(daily_delta) OVER (
                   PARTITION BY account, currency, scale
                   ORDER BY date
                 )
          FROM (
            SELECT account, currency, scale, date,
                   SUM(amount_scaled) AS daily_delta
            FROM (
              SELECT account, currency, scale, date, amount_scaled FROM postings
              UNION ALL
              SELECT account, currency, scale, date, amount_scaled FROM plug_postings
            )
            WHERE (SELECT COUNT(*) FROM daily_balances) = 0
            GROUP BY account, currency, scale, date
          )`,
  },
  // Full-text index over transaction payee + narration, for the `search` tool's
  // payee_q. Standalone FTS5 (keeps its own copy; rowid = transactions.id) kept
  // in sync by triggers; backfilled once for existing rows.
  {
    label: 'transactions_fts',
    sql: `CREATE VIRTUAL TABLE IF NOT EXISTS transactions_fts USING fts5(payee, narration)`,
  },
  {
    label: 'transactions_fts_ai',
    sql: `CREATE TRIGGER IF NOT EXISTS transactions_fts_ai AFTER INSERT ON transactions BEGIN
            INSERT INTO transactions_fts(rowid, payee, narration) VALUES (new.id, new.payee, new.narration);
          END`,
  },
  {
    label: 'transactions_fts_ad',
    sql: `CREATE TRIGGER IF NOT EXISTS transactions_fts_ad AFTER DELETE ON transactions BEGIN
            DELETE FROM transactions_fts WHERE rowid = old.id;
          END`,
  },
  {
    label: 'transactions_fts_au',
    sql: `CREATE TRIGGER IF NOT EXISTS transactions_fts_au AFTER UPDATE ON transactions BEGIN
            DELETE FROM transactions_fts WHERE rowid = old.id;
            INSERT INTO transactions_fts(rowid, payee, narration) VALUES (new.id, new.payee, new.narration);
          END`,
  },
  {
    label: 'transactions_fts_backfill_once',
    sql: `INSERT INTO transactions_fts(rowid, payee, narration)
          SELECT id, payee, narration FROM transactions
          WHERE (SELECT COUNT(*) FROM transactions_fts) = 0`,
  },
]
