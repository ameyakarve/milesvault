# Output format: JSON entries (ingest pipeline)

You are running headless in the statement-ingest pipeline. Everything above —
the beancount conventions, account shapes, worked examples, extraction rules —
applies EXACTLY as written, with ONE difference: instead of calling a tool,
output a single JSON object and NOTHING else.

## Schema

```json
{
  "card_name": "issuer + card name as printed on the statement",
  "entries": [
    {
      "id": "t1",
      "kind": "transaction",
      "date": "YYYY-MM-DD",
      "payee": "merchant as printed",
      "narration": "short note",
      "tags": [],
      "postings": [
        { "account": "Expenses:Food:Restaurants", "amount": 500.00, "currency": "INR" },
        { "account": "Liabilities:CreditCards:Axis:SelectPlus:1234", "amount": -500.00, "currency": "INR" }
      ]
    },
    {
      "id": "b1",
      "kind": "pad",
      "date": "YYYY-MM-DD",
      "account": "Liabilities:CreditCards:Axis:SelectPlus:1234",
      "amount": 5432.10,
      "currency": "INR"
    }
  ]
}
```

## Fields

- **`id`** — REQUIRED on EVERY entry. A short unique string you assign (e.g.
  `"t1"`, `"t2"`, `"b1"`). It is how the validator points at a specific entry:
  if some entries come back invalid you'll be asked to return ONLY those, by
  id — so keep each entry's id stable and don't reuse one.
- **`kind`** — REQUIRED. Exactly `"transaction"`, `"pad"`, or `"balance"`.
- **transaction** = `{ id, kind:"transaction", date (YYYY-MM-DD), payee,
  narration, tags (array, usually empty), postings (2–8) }`. Each posting is
  `{ account, amount (number), currency }`. Write EVERY posting in full,
  **including the card-leg amount** — postings must sum to zero per currency
  (the validator checks this; nothing is computed for you).
- **pad** = `{ id, kind:"pad", date, account, amount (number), currency }` — a
  reconciling closing assertion. It renders to a beancount **pad + balance**
  pair FOR you: the pad absorbs any drift between the figure you assert and what
  your entries actually left in the account, then the balance asserts the
  figure. Use `pad` for every statement closing — the card's closing
  outstanding and the points closing balance. It is ONE entry with ONE amount
  (the printed closing). The pad is added downstream — there is no separate
  "pad" entry to emit, and **never** emit a 0-amount opening pad alongside the
  closing.
- **balance** = `{ id, kind:"balance", date, account, amount (number),
  currency }` — a BARE assertion (no pad). The running balance must already
  equal the figure exactly or the write is rejected. Rarely needed in statement
  ingest — prefer `pad` for closings.

## JSON-specific rules

(the conventions above still govern accounts, dates, signs, categories,
exclusions, noise.)

- Refunds / credits TO the card: NEGATIVE expense amount, POSITIVE card amount.
- Forex rows: the expense amount in the foreign currency plus
  `"price_at_signs": 2, "price_amount": <INR total as printed>,
  "price_currency": "INR"` — the `@@` form from the examples. Applies to forex
  REFUNDS too (negative foreign amount, the refunded INR total as the price).
  A non-INR amount without its INR price is INVALID.
- Tags are for LINKING related entries only (a refund ↔ its original may share
  a tag). For a transaction the card earns no points on, simply omit the
  points legs — do not tag it.
- The reward-points balance, the points legs, and the landing follow the
  extraction rules above — emit them with the REAL programme account and ticker
  (given in the user turn). Nothing is resolved downstream; what you emit is
  what is written, checked only by the balance/shape validator.
