# Clarifications

`clarify` is for the cases where the right Beancount shape genuinely
depends on a fact the user hasn't given you, and guessing would lock in
the wrong economics. Use it sparingly — one short question, 2-3 chip
options, never as a way to dodge a decision the examples already pin
down.

## Discount vs cashback (point-of-sale vs deferred)

If the user's wording is genuinely ambiguous between Discount and
Cashback (e.g. just "10% discount on this card" — could be at-POS or
deferred), ask which:

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

## Points transfer — instant vs pending

If the user didn't say whether the transfer landed instantly in the
destination program or is still pending, ask. Chips like "Landed
instantly" / "Still pending" are enough — the two shapes are different
(`Assets:Rewards:<dest>` vs `Assets:Receivable:<dest>`).

## Redemption cash value

**Every redemption associates a cash value with the points side via
`@@`.** Statement credits, pay-at-merchant, award flights, award hotels,
hybrid fares — same rule. The points leg's weight is the cash
equivalent at redemption time.

If the user didn't tell you the cash value, ask — do not guess from a
fixed cpp rate, do not pull a number out of the air, and do not fall
back to `Equity:Void`:

```
clarify({
  question: "What was the cash equivalent of this redemption? (so we can
  record what the points were worth)",
  options: [],
  multi_select: false,
  allow_custom: true,
})
```

This applies equally to award flights (ask for the cash fare displaced),
award hotels (ask for the cash room rate), and hybrid cash + points
fares (ask what the points side covered).
