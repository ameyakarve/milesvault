# Output format: beancount entries (ingest pipeline)

You are running headless in the statement-ingest pipeline. Everything above —
the beancount conventions, account shapes, worked examples, extraction rules —
applies EXACTLY as written, with ONE difference: instead of calling a tool,
output a single JSON object and NOTHING else. That object wraps your beancount
entries — each `text` is ONE beancount entry, exactly as you'd write it in the
ledger.

## Schema

```json
{
  "card_name": "issuer + card name as printed on the statement",
  "entries": [
    {
      "id": "t1",
      "text": "2026-05-12 * \"MERCHANT\" \"Shopping\"\n  Expenses:Food:Restaurants  500.00 INR\n  Liabilities:CreditCards:Axis:SelectPlus:1234  -500.00 INR"
    },
    {
      "id": "b1",
      "text": "2026-05-31 pad Liabilities:CreditCards:Axis:SelectPlus:1234 Equity:Void\n2026-05-31 balance Liabilities:CreditCards:Axis:SelectPlus:1234  5432.10 INR"
    }
  ]
}
```

## Fields

- **`id`** — REQUIRED on EVERY entry. A short unique string you assign (e.g.
  `"t1"`, `"t2"`, `"b1"`). It is how the validator points at a specific entry:
  if some entries come back invalid you'll be asked to return ONLY those, by
  id — so keep each entry's id stable and don't reuse one. The id is a handle
  only; it is never written to the ledger.
- **`text`** — REQUIRED. ONE beancount entry as text (use `\n` for line breaks
  inside the JSON string). It is ONE of:
  - a **transaction**: a date header then 2+ posting lines. Write EVERY posting
    in full, **including the card-leg amount and currency** — postings must sum
    to zero per currency (the validator checks this; nothing is computed for
    you, and a blank amount is rejected).
  - a **pad + balance** (two lines): use this for every statement closing — the
    card's closing outstanding and the points closing balance. The pad absorbs
    any drift between the figure you assert and what your entries left in the
    account, then the balance asserts the figure. The plug is always
    `Equity:Void`, written on the pad line. ONE pad+balance per closing
    figure — never a 0-amount opening pad alongside the closing.
  - a bare **balance** (one line): the running balance must already equal the
    figure exactly. Rarely needed in statement ingest — prefer pad+balance.

## Rules (the conventions above still govern accounts, dates, signs, categories, exclusions, noise)

- Refunds / credits TO the card: NEGATIVE expense amount, POSITIVE card amount.
- Forex rows: the expense leg in the foreign currency carries the INR total as a
  `@@` price — `<foreign amount> <CCY> @@ <INR total as printed> INR`. Applies to
  forex REFUNDS too (negative foreign amount, the refunded INR total as the
  price). A non-INR amount without its INR `@@` price is INVALID.
- The reward-points balance, the points legs, and the landing follow the
  extraction rules above — emit them with the REAL programme account and ticker
  (given in the user turn). Nothing is resolved downstream; what you emit is
  what is written, checked only by the balance/shape validator.
