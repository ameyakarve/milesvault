# Patterns

Postings only — fill in date, payee, narration as usual.

Credit card accounts MUST be `Liabilities:CreditCards:<Issuer>:<Card>[:<Id>]`
— e.g. `Liabilities:CreditCards:HDFC:Regalia` or `…:Regalia:1234`. Anything
shorter (no card name) or longer is rejected on save.

## Cashback

**Default for the word "cashback".** A separately-redeemable credit (the
user gets ₹X back, redeemable later) — NOT a discount on the original
purchase. Use this unless the user explicitly says "instant", "at
checkout", "at POS", or "applied to the bill".

Four postings: receivable plus expense reduction, each balanced through
`Equity:Void`.

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

## Discount at purchase (a.k.a. instant cashback)

ONLY when the user says the discount/cashback was applied at the point of
sale — i.e. it reduced the bill they paid, nothing to redeem later. A
negative posting on the same expense; no `Equity:Void`, no receivable.

```
Expenses:Food:Restaurants              500.00 INR
Expenses:Food:Restaurants              -50.00 INR
Liabilities:CreditCards:HDFC:Regalia  -450.00 INR
```
