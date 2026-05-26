# Examples

One transaction captures the purchase AND the reward it earned. Cashback
and points don't fall out of the sky — they always pair with the expense
that generated them.

## Which pattern (decide by the economics, not the card's name)

The card's product name (e.g. "HSBC Cashback card") is just branding —
ignore it. Decide by what the reward did to THIS purchase:

- Did it reduce the amount the user paid for this purchase, right now?
  → **Discount** pattern (3 postings, no receivable). Includes things
  the user calls "discount", "X% off", "instant cashback", "applied to
  the bill", "cashback at POS".
- Is it a separate credit the user can redeem later (lands on a future
  statement / accumulates in a cashback pool)? → **Cashback** pattern
  (4 postings with `Assets:Receivable:<Issuer>` + expense reduction).
- Is it in a non-cash unit (points, miles)? → **Points** pattern
  (4 postings, multi-currency, `Equity:Void` contra).

If the user's wording is genuinely ambiguous between Discount and
Cashback (e.g. just "10% discount on this card" — could be at-POS or
deferred), call `clarify` with one short question and 2-3 chip
options, e.g.:

```
clarify({
  question: "Was the 10% reduction applied to this bill, or does it
  come back later as cashback?",
  options: [
    "Applied to this bill (POS discount)",
    "Comes back later as cashback",
  ],
  multi_select: false,
  allow_custom: false,
})
```

## Account formats (strict)

- Credit cards: `Liabilities:CreditCards:<Issuer>:<Card>[:<Id>]`
  — e.g. `Liabilities:CreditCards:HDFC:Regalia` or
  `Liabilities:CreditCards:HSBC:Cashback:9065`.
- Cashback / points receivable: `Assets:Receivable:<Issuer>` — singular
  `Receivable`, then the issuer (NOT the card name, NOT `Cashback`,
  NOT plural).

## Cashback pattern (word: "cashback")

A separately-redeemable credit posted by the issuer (₹X back, redeemable
later). Four postings: purchase (2) + receivable accrual (+) + matching
expense reduction (−). The expense leg IS the contra — no `Equity:Void`.

```
2026-05-21 * "Starbucks" "Coffee — ₹3.70 cashback"
  Expenses:Food:Coffee                       37.00 INR
  Liabilities:CreditCards:HSBC:Cashback:9065 -37.00 INR
  Assets:Receivable:HSBC                      3.70 INR
  Expenses:Food:Coffee                       -3.70 INR
```

INR sums to zero. Net expense to dashboards = ₹33.30; card paid ₹37;
receivable accrues ₹3.70.

## Points pattern (words: "points", "miles")

Multi-currency single transaction: purchase legs in INR/USD, points legs
in the program's point currency (`HDFC_RP`, `AMEX_MR`, `CHASE_UR`, …).
No expense-reduction leg — points' cash value isn't fixed at earn time.

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
