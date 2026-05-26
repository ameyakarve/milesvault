# Examples

Copy the shape exactly: date, flag, payee, narration, then postings.

## Account formats (strict)

- Credit cards: `Liabilities:CreditCards:<Issuer>:<Card>[:<Id>]`
  — e.g. `Liabilities:CreditCards:HDFC:Regalia` or
  `Liabilities:CreditCards:HSBC:Cashback:9065`. Anything else is rejected.
- Cashback receivable: `Assets:Receivable:<Issuer>` — singular `Receivable`,
  then the issuer (NOT the card name, NOT `Cashback`, NOT plural).
- Reward-points receivable: same — `Assets:Receivable:<Issuer>`, but in
  the program's point currency (e.g. `HDFC_RP`, `AMEX_MR`, `CHASE_UR`).

## Cashback (default for the word "cashback")

A separately-redeemable credit posted by the issuer (₹X back, redeemable
later) — NOT a discount on the bill the user paid. Use this whenever the
user just says "cashback" without "instant" / "at checkout" / "at POS" /
"applied to the bill".

Four postings: receivable plus expense reduction, each balanced through
`Equity:Void`. Same currency on all four legs.

```
2026-05-21 * "HDFC" "April dining cashback"
  Assets:Receivable:HDFC      250.00 INR
  Equity:Void                -250.00 INR
  Expenses:Food:Restaurants  -250.00 INR
  Equity:Void                 250.00 INR
```

## Reward points (earn)

Receivable in the program's point currency. Two postings, both in the
point unit; do not mix in INR/USD. No expense leg — points' cash value
isn't fixed at earn time, so don't try to reduce the source expense.

```
2026-05-21 * "HDFC" "May dining — 25 reward points"
  Assets:Receivable:HDFC      25 HDFC_RP
  Equity:Void                -25 HDFC_RP
```

## Discount at purchase (a.k.a. instant cashback)

ONLY when the user says the discount/cashback was applied at the point of
sale — i.e. it reduced the bill they paid, nothing to redeem later. A
negative posting on the same expense; no `Equity:Void`, no receivable.

```
2026-05-21 * "Swiggy" "Dinner — ₹50 instant cashback"
  Expenses:Food:Restaurants              500.00 INR
  Expenses:Food:Restaurants              -50.00 INR
  Liabilities:CreditCards:HDFC:Regalia  -450.00 INR
```
