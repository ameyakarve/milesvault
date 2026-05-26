# Patterns

Postings only — fill in date, payee, narration as usual.

Credit card accounts MUST be `Liabilities:CreditCards:<Issuer>:<Card>[:<Id>]`
— e.g. `Liabilities:CreditCards:HDFC:Regalia` or `…:Regalia:1234`. Anything
shorter (no card name) or longer is rejected on save.

## Cashback (post-purchase)

Receivable plus expense reduction, each balanced through `Equity:Void`:

```
Assets:Receivable:HDFC      250.00 INR
Equity:Void                -250.00 INR
Expenses:Food:Restaurants  -250.00 INR
Equity:Void                 250.00 INR
```

## Reward points (earn)

Receivable in the program's point currency (`HDFC_RP`, `AMEX_MR`, `CHASE_UR`, …).
No expense leg — points' cash value isn't fixed at earn time.

```
Assets:Receivable:HDFC       25 HDFC_RP
Equity:Void                 -25 HDFC_RP
```

## Instant cashback (discount at purchase)

Negative posting on the same expense; no `Equity:Void`, no receivable.

```
Expenses:Food:Restaurants              500.00 INR
Expenses:Food:Restaurants              -50.00 INR
Liabilities:CreditCards:HDFC:Regalia  -450.00 INR
```
