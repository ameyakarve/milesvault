# Examples

One transaction captures the purchase AND the reward it earned. Cashback
and points don't fall out of the sky — they always pair with the expense
that generated them.

## Account formats (strict)

- Credit cards: `Liabilities:CreditCards:<Issuer>:<Card>[:<Id>]`
  — e.g. `Liabilities:CreditCards:HDFC:Regalia` or
  `Liabilities:CreditCards:HSBC:Cashback:9065`.
- Cashback / points receivable: `Assets:Receivable:<Issuer>` — singular
  `Receivable`, then the issuer (NOT the card name, NOT `Cashback`,
  NOT plural).

## Purchase + cashback (default for the word "cashback")

A separately-redeemable credit posted by the issuer (₹X back, redeemable
later) — NOT a discount on the bill the user paid. Use this whenever the
user just says "cashback" without "instant" / "at checkout" / "at POS" /
"applied to the bill".

Four postings in ONE transaction: the purchase (2) + receivable accrual
(+) and matching expense reduction (−). The expense leg IS the contra —
no `Equity:Void` needed (same currency on both sides).

```
2026-05-21 * "Starbucks" "Coffee — ₹3.70 cashback"
  Expenses:Food:Coffee                       37.00 INR
  Liabilities:CreditCards:HSBC:Cashback:9065 -37.00 INR
  Assets:Receivable:HSBC                      3.70 INR
  Expenses:Food:Coffee                       -3.70 INR
```

INR sums to zero. Net expense to dashboards = ₹33.30; card paid ₹37;
receivable accrues ₹3.70.

## Purchase + reward points (earn)

Multi-currency single transaction: the purchase legs in INR/USD, the
points legs in the program's point currency (`HDFC_RP`, `AMEX_MR`,
`CHASE_UR`, …). No expense-reduction leg — points' cash value isn't
fixed at earn time.

```
2026-05-21 * "Taj" "Dinner — 250 reward points"
  Expenses:Food:Restaurants                  2500.00 INR
  Liabilities:CreditCards:HDFC:Regalia      -2500.00 INR
  Assets:Receivable:HDFC                         250 HDFC_RP
  Equity:Void                                   -250 HDFC_RP
```

Each currency balances on its own.

## Instant cashback (discount at purchase)

ONLY when the user says the discount/cashback was applied at the point of
sale — i.e. it reduced the bill they paid, nothing to redeem later. A
negative posting on the same expense; no `Equity:Void`, no receivable.

```
2026-05-21 * "Swiggy" "Dinner — ₹50 instant cashback"
  Expenses:Food:Restaurants                  500.00 INR
  Expenses:Food:Restaurants                  -50.00 INR
  Liabilities:CreditCards:HDFC:Regalia      -450.00 INR
```
