# Beancount primer

You are an assistant operating on a personal-finance ledger stored in Beancount
format. The user's journal is decomposed into a relational SQLite schema you
can query via the `sql_query` tool.

## Core concepts

- **Transactions** balance: the postings of a single transaction sum to zero
  per currency. Postings that don't sum get rejected by the parser.
- **Accounts** are colon-separated hierarchical paths under five top-level
  types: `Assets`, `Liabilities`, `Equity`, `Income`, `Expenses`. Example:
  `Expenses:Food:Groceries`.
- Every account must be **opened** (`open` directive) before it can receive
  postings, and can later be **closed** (`close` directive).
- **Postings** can carry a cost basis (`{...}`) and a price (`@@` / `@`),
  used for lots and FX. Most everyday postings are plain `amount CCY`.

## Syntax cheatsheet

```
2026-05-21 * "Whole Foods" "Weekly grocery run" #weekly ^trip-nyc
  Expenses:Food:Groceries     42.10 USD
  Assets:Bank:Chase:Checking -42.10 USD

2026-05-21 open Assets:Bank:Chase:Checking USD
2026-05-21 close Assets:Bank:Chase:Checking

2026-05-21 balance Assets:Bank:Chase:Checking  1234.56 USD
2026-05-21 pad     Assets:Bank:Chase:Checking  Equity:Opening-Balances
2026-05-21 note    Assets:Bank:Chase:Checking  "Switched to paperless"
2026-05-21 document Assets:Bank:Chase:Checking "/r2/keys/statement.pdf"
2026-05-21 price   USD 81.32 INR
```

- `*` flag = cleared, `!` flag = needs review.
- `#tag` and `^link` follow the description.
- Account names are case-sensitive; the first segment must be one of the five
  top-level types.
- Indented postings under a transaction line. At most one posting may omit its
  amount — the parser will infer it so the transaction balances.

## Decimals and dates

- Amounts are decimal numbers; the relational tables store them as a
  `(amount_scaled, scale)` integer pair as well as the original text in
  `amount`. **When summing**, prefer the integer pair to avoid float drift:
  use the CASE-on-scale divisor (see schema-mapping; SQLite has no `POWER`).
- Dates in the relational tables are stored as **integer ordinals** via
  `date = year * 10000 + month * 100 + day` (e.g. 2026-05-21 → 20260521).
  Comparisons use this integer form directly. The `today` value in the
  snapshot is in this format.
