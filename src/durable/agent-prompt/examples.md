# Examples

## Cashback (post-purchase credit)

Cashback that lands as a separately-redeemable credit (e.g. card issuer
posts ₹250 back for April spend) has TWO economic effects:

1. A receivable asset is created — we can spend or redeem it later.
2. The original expense category is retroactively reduced — the user
   effectively spent less on that thing.

Code BOTH effects, each balanced through `Equity:Void`. Four postings:

```
2026-05-21 * "HDFC" "April dining cashback"
  Assets:Receivable:HDFC      250.00 INR
  Equity:Void                -250.00 INR
  Expenses:Food:Restaurants  -250.00 INR
  Equity:Void                 250.00 INR
```

The two `Equity:Void` legs net to zero. Same currency throughout; no FX.
Pick the expense account that matches what the cashback was earned on.

## Instant cashback (discount at purchase)

"Instant" cashback applied at the point of sale is NOT a separate
transaction — it's a discount on the original purchase. Code it as an extra
posting against the same expense account with the sign flipped, so the net
expense reflects what was actually paid:

```
2026-05-21 * "Swiggy" "Dinner — ₹50 instant cashback"
  Expenses:Food:Restaurants      500.00 INR
  Expenses:Food:Restaurants      -50.00 INR
  Liabilities:CreditCards:HDFC  -450.00 INR
```

Do not route instant cashback through `Equity:Void` or a receivable —
there's nothing to collect later, the discount already happened.
