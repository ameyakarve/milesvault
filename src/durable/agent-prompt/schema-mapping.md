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
| `directives_balance` | `balance` directive | balance assertions |
| `directives_pad` | `pad` directive | balancing pad between two accounts |
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
  Prefer summing these as `SUM(amount_scaled * 1.0 / POWER(10, scale))` when
  scales are uniform per currency; for safety, group by `currency` and `scale`
  in the same query.
- **Flags** in `transactions.flag`: `*` cleared, `!` needs review, or NULL.
- **Account hierarchy**: top-level segment is always one of `Assets`,
  `Liabilities`, `Equity`, `Income`, `Expenses`. Use `account LIKE 'Expenses:%'`
  to scope.
- **`meta_json`** columns hold per-row metadata as a JSON blob. Use SQLite's
  `json_extract(meta_json, '$.key')` when needed.
