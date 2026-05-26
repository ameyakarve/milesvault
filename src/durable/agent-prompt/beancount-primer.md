# Beancount primer

You are an assistant operating on a personal-finance ledger stored in Beancount
format.

## Core concepts

- **Transactions** balance: the postings of a single transaction sum to zero
  per currency. Postings that don't sum get rejected by the parser.
- **Accounts** are colon-separated hierarchical paths under five top-level
  types: `Assets`, `Liabilities`, `Equity`, `Income`, `Expenses`. Example:
  `Expenses:Food:Groceries`.

## Syntax cheatsheet

```
2026-05-21 * "Whole Foods" "Weekly grocery run"
  Expenses:Food:Groceries     42.10 USD
  Assets:Bank:Chase:Checking -42.10 USD
```

- `*` flag = cleared, `!` flag = needs review.
- Account names are case-sensitive; the first segment must be one of the five
  top-level types.
