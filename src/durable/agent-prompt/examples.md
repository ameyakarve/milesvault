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
- Cashback receivable (cash owed, lands later on a statement):
  `Assets:Receivable:<Issuer>` — singular `Receivable`, then the issuer
  (NOT the card name, NOT `Cashback`, NOT plural).
- Held points / miles balance (already in your account, not "owed"):
  `Assets:Rewards:<Issuer>` — e.g. `Assets:Rewards:HDFC`,
  `Assets:Rewards:AMEX`. Use this for any point-currency balance.

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
  Assets:Rewards:HDFC                            250 HDFC_RP
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

## Transfers (money moves between your accounts — no expense)

### Salary received
Income postings are negative — that's the Beancount sign convention for
a credit to your books.
```
2026-05-25 * "ACME Corp" "May salary"
  Assets:Bank:HDFC:Savings   125000.00 INR
  Income:Salary             -125000.00 INR
```

### Bank → bank (your own accounts)
Pure shuffle between accounts you own. No expense, no income.
```
2026-05-26 * "Self" "Move to ICICI for rent"
  Assets:Bank:ICICI:Savings   50000.00 INR
  Assets:Bank:HDFC:Savings   -50000.00 INR
```

### ATM withdrawal (bank → cash)
```
2026-05-26 * "ATM" "Cash withdrawal"
  Assets:Cash                 2000.00 INR
  Assets:Bank:HDFC:Savings   -2000.00 INR
```

### Credit-card bill payment (bank → card)
Mirror of a purchase. The card leg is positive (reducing the liability),
the bank leg is negative.
```
2026-05-26 * "HDFC" "May Regalia bill"
  Liabilities:CreditCards:HDFC:Regalia   45000.00 INR
  Assets:Bank:HDFC:Savings              -45000.00 INR
```

## Cash and UPI spends

UPI from a regular bank account behaves exactly like cash — money leaves
the bank instantly, no liability in between. Same shape on both: expense
on one side, bank/cash on the other.

(UPI on a credit card is a separate case — that hits the card liability
like any other charge.)

```
2026-05-26 * "Chai shop" "Tea"
  Expenses:Food:Beverages    30.00 INR
  Assets:Cash               -30.00 INR
```

```
2026-05-26 * "Auto driver" "UPI — ride home"
  Expenses:Travel:Auto       120.00 INR
  Assets:Bank:HDFC:Savings  -120.00 INR
```

## Settling with people

Use `Assets:Receivable:<Person>` for what they owe you,
`Liabilities:Payable:<Person>` for what you owe them. Payables follow
the same sign convention as credit cards (negative = you owe).

### You paid the whole bill; friend owes their share
Card got charged the full amount; half is your expense, half is owed to
you and sits in `Receivable` until they pay.
```
2026-05-26 * "BBQ Nation" "Dinner — split 50/50 with Rohan"
  Expenses:Food:Restaurants               1500.00 INR
  Assets:Receivable:Rohan                 1500.00 INR
  Liabilities:CreditCards:HDFC:Regalia   -3000.00 INR
```

### Friend pays you back
Clears the receivable to zero.
```
2026-05-27 * "Rohan" "UPI — dinner share"
  Assets:Bank:HDFC:Savings    1500.00 INR
  Assets:Receivable:Rohan    -1500.00 INR
```

### Friend paid for both; you owe them
You consumed the expense, but no card / cash of yours moved — the credit
side is a `Payable`.
```
2026-05-26 * "Sneha" "Movie tickets she booked for both of us"
  Expenses:Entertainment:Movies   750.00 INR
  Liabilities:Payable:Sneha      -750.00 INR
```

### You pay friend back
Cash leaves your bank; the payable posting is positive (reducing the
liability back to zero).
```
2026-05-27 * "Sneha" "UPI — movie tickets"
  Liabilities:Payable:Sneha    750.00 INR
  Assets:Bank:HDFC:Savings    -750.00 INR
```

## Reimbursements (work expenses you'll claim back)

### Out of pocket now, claim later
Record the receivable up front so the spend doesn't dilute personal P&L.
Same shape as splitting a bill — company in place of friend.
```
2026-05-26 * "Uber" "Client meeting — claim from ACME"
  Assets:Receivable:ACME                  500.00 INR
  Liabilities:CreditCards:HDFC:Regalia   -500.00 INR
```

### Reimbursement lands
Same shape as a friend paying you back.
```
2026-06-15 * "ACME" "May reimbursement payout"
  Assets:Bank:HDFC:Savings    500.00 INR
  Assets:Receivable:ACME     -500.00 INR
```

## Refunds (reverse an earlier purchase)

Exact mirror of the original purchase — sign-flipped on both legs. If the
refund hits a different card / bank than the original, swap the second
leg accordingly.
```
2026-05-26 * "Amazon" "Refund — returned earphones"
  Expenses:Shopping:Electronics              -3500.00 INR
  Liabilities:CreditCards:HDFC:Regalia        3500.00 INR
```

## Points transfers between programs

Moving points from one program to another at a defined rate — always a
conversion, so the rate lives in `@@`. The ratio (1:1, 1:1.3, 1:2,
whatever bonus is running) doesn't change the shape; it just changes
the two numbers.

### Instant landing (points show up in the destination right away)
```
2026-05-27 * "Chase" "Transfer 10000 UR → 13000 United (30% bonus)"
  Assets:Rewards:United     13000 UA_MILES @@ 10000 CHASE_UR
  Assets:Rewards:Chase     -10000 CHASE_UR
```

### Pending (transfer initiated but points haven't landed yet)
Mirror of the cashback-vs-discount split: until the destination program
posts the points, they're owed by that program — sit them in a
receivable.
```
2026-05-27 * "Chase" "Transfer 10000 UR → 13000 United (pending)"
  Assets:Receivable:United     13000 UA_MILES @@ 10000 CHASE_UR
  Assets:Rewards:Chase        -10000 CHASE_UR
```

When the points land, settle the receivable:
```
2026-05-30 * "United" "Transfer credited"
  Assets:Rewards:United        13000 UA_MILES
  Assets:Receivable:United    -13000 UA_MILES
```

If the user didn't say whether the transfer was instant or pending and
it could plausibly be either, call `clarify` with chips like "Landed
instantly" / "Still pending".

## Redemptions (using up rewards earned earlier)

### Cashback applied to the statement (same currency)
Settles the receivable from the Cashback pattern. Card liability goes
down, receivable goes back to zero.
```
2026-05-31 * "HSBC" "Cashback credited to May statement"
  Liabilities:CreditCards:HSBC:Cashback:9065   3.70 INR
  Assets:Receivable:HSBC                      -3.70 INR
```

### Points redeemed for statement credit (cross-currency)
Use Beancount's `@@` total-price annotation — the points leg's weight
gets re-expressed in the target currency (INR) for the balance check.
Two clean postings, no `Equity:Void`.
```
2026-05-31 * "HDFC" "Redeem 1000 pts → ₹250 statement credit"
  Assets:Rewards:HDFC                    -1000 HDFC_RP @@ 250.00 INR
  Liabilities:CreditCards:HDFC:Regalia    250.00 INR
```

## When to use `@@` vs `Equity:Void` on the point side

- **Conversion** — point currency is being exchanged for cash or another
  point currency at a defined rate: use `@@` on the point posting.
  (Examples: transferring 10k Chase UR → 13k United, redeeming points
  for a statement credit, paying with points at a merchant, buying
  points with cash.)
- **Accrual / write-off** — point balance changes without any conversion
  (no rate is being asserted): use `Equity:Void` as the point-side
  contra. (Examples: earning points on a purchase, anniversary bonuses,
  expiry sweeps, redeeming miles for an award flight where the flight
  itself doesn't have a cost-in-miles being claimed.)
