# Schema ↔ Beancount mapping

The Beancount journal is decomposed into a SQLite relational schema. The full
DDL (tables + indexes) is included in the per-turn snapshot below — read it
there, do not re-query `sqlite_master` or `PRAGMA table_info`. This document
covers the **semantics** the DDL itself can't express.

## Tables ↔ Beancount constructs

| Table | Beancount | Note |
|---|---|---|
| `transactions` | the header line `YYYY-MM-DD <flag> "<payee>" "<narration>"` | one row per transaction |
| `postings` | the indented amount lines under a transaction | one row per posting; `txn_id` + `idx` order them |
| `txn_tags` | `#tag` on a transaction | join on `txn_id` |
| `txn_links` | `^link` on a transaction | join on `txn_id` |
| `directives_open` | `open` directive | account opens; `constraint_currencies` is a JSON array |
| `directives_close` | `close` directive | |
| `directives_commodity` | `commodity` directive | |
| `directives_balance` | `balance` directive | balance assertions; nullable `plug_account` pairs the assertion with an implicit pad that routes the gap from `plug_account` to `account` |
| `directives_price` | `price` directive | commodity prices over time |
| `directives_note` | `note` directive | |
| `directives_document` | `document` directive | attached files |
| `directives_event` | `event` directive | named events (e.g. location) |

## Encoding conventions

- **Dates** are stored as integer ordinals: `year * 10000 + month * 100 + day`.
  Today's value is provided in the per-turn snapshot. Compare with `WHERE date
  BETWEEN ? AND ?`, never with strings.
- **Decimals** are stored as a `(amount_scaled, scale)` integer pair in the
  `amount_scaled`/`scale` columns (also present on prices and balances).
  **SQLite has no `POWER`** — convert with a CASE on `scale`:
  ```sql
  amount_scaled * 1.0 / CASE scale
    WHEN 0 THEN 1     WHEN 1 THEN 10      WHEN 2 THEN 100
    WHEN 3 THEN 1000  WHEN 4 THEN 10000   WHEN 5 THEN 100000
    WHEN 6 THEN 1000000 ELSE 1 END
  ```
  In practice almost everything is `scale = 2` (cents). Prefer summing as
  the CASE-divided value above when
  scales are uniform per currency; for safety, group by `currency` and `scale`
  in the same query.
- **Flags** in `transactions.flag`: `*` cleared, `!` needs review, or NULL.
- **Account hierarchy**: top-level segment is always one of `Assets`,
  `Liabilities`, `Equity`, `Income`, `Expenses`. Use `account LIKE 'Expenses:%'`
  to scope.
- **`meta_json`** columns hold per-row metadata as a JSON blob. Use SQLite's
  `json_extract(meta_json, '$.key')` when needed.
