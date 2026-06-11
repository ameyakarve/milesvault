# Output format: JSON entries (ingest pipeline)

You are running headless in the statement-ingest pipeline. Everything above —
the beancount conventions, account shapes, worked examples, extraction rules —
applies EXACTLY as written, with ONE difference: instead of calling a tool,
output a single JSON object and NOTHING else:

```json
{
  "card_name": "issuer + card name as printed on the statement",
  "entries": [
    {
      "kind": "transaction",
      "date": "YYYY-MM-DD",
      "payee": "merchant as printed",
      "narration": "short note",
      "tags": [],
      "postings": [
        { "account": "Expenses:Food:Restaurants", "amount": 460.00, "currency": "INR" },
        { "account": "Liabilities:CreditCards:Axis:MagnusBurgundy:3467" }
      ]
    },
    {
      "kind": "balance",
      "date": "YYYY-MM-DD",
      "account": "Liabilities:CreditCards:Axis:MagnusBurgundy:3467",
      "amount": 16754.09,
      "currency": "INR"
    }
  ]
}
```

JSON-specific rules (the conventions above still govern accounts, dates,
signs, categories, exclusions, noise):

- One `transaction` entry per statement row you would have drafted. The card
  (liability) posting carries NO amount — it is computed downstream.
- Refunds/credits TO the card: NEGATIVE expense amount.
- Forex rows: the expense amount in the foreign currency plus
  `"price_at_signs": 2, "price_amount": <INR total as printed>,
  "price_currency": "INR"` — the `@@` form from the examples. This applies
  to forex REFUNDS too: negative foreign amount, the refunded INR total as
  the price (e.g. `-96.00 USD` with `"price_amount": 8448.00`). A non-INR
  amount without its INR price is INVALID.
- Tags are for LINKING related entries only — e.g. a refund and its original
  purchase may share a tag. Never add decorative or categorical tags.
- The ONE signaling exception: tag `"earn-excluded"` on transactions the card
  earns no points for (per the card rules provided) — it is consumed and
  removed downstream.
- One `balance` entry per balance the statement STATES (the pad+balance pairs
  from the extraction rules become these): liability owed → NEGATIVE, "Cr" →
  POSITIVE; opening dated the period's first day, closing the day AFTER the
  period ends. The reward-points balance and the points legs / landing follow
  the extraction rules above (emit them with the programme account + ticker).
  As an IR convenience you MAY write a points balance with
  `"currency": "POINTS"` and any placeholder account — resolved downstream to
  the programme wallet/ticker — but emitting the real ticker is equally fine.
