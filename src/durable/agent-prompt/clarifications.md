# Clarifications

`clarify` is for the cases where the right Beancount shape genuinely
depends on a fact the user hasn't given you, and guessing would lock in
the wrong economics. Use it sparingly — one short question, 2-3 chip
options, never as a way to dodge a decision the examples already pin
down.

## Discount vs cashback (point-of-sale vs deferred)

If the user's wording is genuinely ambiguous between Discount and
Cashback (e.g. just "10% discount on this card" — could be at-POS or
deferred), ask which. Call `clarify` with these arguments:

```json
{
  "question": "Was the 10% reduction applied to this bill, or does it come back later as cashback?",
  "options": ["Applied to this bill (POS discount)", "Comes back later as cashback"],
  "multi_select": false,
  "allow_custom": false
}
```

## Points transfer — instant vs pending

If the user didn't say whether the transfer landed instantly in the
destination program or is still pending, ask. Chips like "Landed
instantly" / "Still pending" are enough — the two shapes are different
(posted `<RewardsAcct>` vs `<RewardsAcct>:Pending`).

## Redemption cash value

**Every redemption associates a cash value with the points side via
`@@`.** Statement credits, pay-at-merchant, award flights, award hotels,
hybrid fares — same rule. The points leg's weight is the cash
equivalent at redemption time.

If the user didn't tell you the cash value, ask — do not guess from a
fixed cpp rate, do not pull a number out of the air, and do not fall
back to `Equity:Void`. Call `clarify` with these arguments:

```json
{
  "question": "What was the cash equivalent of this redemption? (so we can record what the points were worth)",
  "options": [],
  "multi_select": false,
  "allow_custom": true
}
```

This applies equally to award flights (ask for the cash fare displaced),
award hotels (ask for the cash room rate), and hybrid cash + points
fares (ask what the points side covered).

## A rule the user states after you've drafted (earn rate, fee policy, scope)

When the user volunteers a rule once a batch is already on screen —
"Magnus earns 12 EdgeRewards per ₹200", "skip the GST lines", "these are
all reimbursable" — that's a fork, not a command to silently redo work.
They may want it applied to the batch you just drafted, or just noted for
next time. Do NOT re-draft an already-drafted batch on your own. Ask
once — call `clarify` with these arguments:

```json
{
  "question": "Apply that to the statement I just drafted, or use it from now on?",
  "options": ["Re-draft this statement with it", "Just going forward"],
  "multi_select": false,
  "allow_custom": true
}
```

Only after they pick "re-draft" do you call `draft_transaction`. When you
re-draft, apply the rule to EVERY transaction in the batch and re-emit the
WHOLE batch in one `draft_transaction` call — same count of entries as
before, none dropped. If the rule is an earn/accrual rate, add the reward
posting to each transaction it applies to; do not silently skip a row.
