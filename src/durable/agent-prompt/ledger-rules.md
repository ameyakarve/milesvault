# Ledger rules

How money, rewards, and balances are modeled in this ledger. These rules apply
EVERYWHERE — typing a transaction in the editor, importing a statement, any
surface. (Beancount syntax and account-path shapes are in the primer; worked
beancount examples are in the examples file.)

## Transaction shape

A credit-card **PURCHASE is FOUR postings** by default — write all four as you
write the entry, never as a later pass:

1. the expense leg,
2. the card leg (NEGATIVE — a purchase adds to what you owe),
3. the `<pool.account>:Pending` points accrual,
4. the `Equity:Void` points contra.

A purchase written with only two postings (expense + card) is INCOMPLETE — you
dropped its points. The ONLY genuinely two-posting entries are: a payment/credit
to the card, an issuer fee / interest / standalone GST, and (the purchase shape
mirrored) a refund. A purchase is two-posting ONLY when the card's earn rules
exclude its category or the points round to zero.

Each entry is ONE complete beancount block — a header line plus 2+ postings, no
leading/trailing blank lines, no comments narrating what the entry is for. The
postings MUST balance per currency under beancount weight rules (`@@` puts the
total in the price currency; `@` is per-unit). A foreign-currency leg on an INR
card MUST use `@@` so its INR weight closes against the card's INR posting.

## Payments to the card

A payment/credit to the card REDUCES what you owe, so the card leg is POSITIVE
and the counter leg `Assets:Clearing:CardPayments` is NEGATIVE — equal
magnitudes, opposite signs, summing to zero (a later bank-statement import
mirrors the clearing leg). Payments earn no points.

## Refunds

A credit that is NOT a bill payment reverses a purchase: NEGATIVE expense leg,
POSITIVE card leg, and the purchase's points REVERSED — the same four-posting
shape mirrored, points computed on the refunded amount. Keep each refund as its
own entry; never net two together or fold a refund into a receivable.

## Categories — the ten canonical expense roots

Pick the best-fitting account from the user's open accounts first. When nothing
fits, create it under ONE of the ten canonical roots — never invent your own
root: `Expenses:Housing` (rent, utilities, repairs), `Expenses:Food`,
`Expenses:Transport` (fuel, ride-share, parking, vehicle service),
`Expenses:Health` (doctor, pharmacy, gym), `Expenses:Shopping`,
`Expenses:Entertainment`, `Expenses:Personal` (grooming, education,
subscriptions), `Expenses:Financial` (fees, interest, taxes, FX markup),
`Expenses:Travel`, `Expenses:Misc`. Map to the nearest root — a medical bill →
`Expenses:Health`, fuel/vehicle → `Expenses:Transport`, a utility →
`Expenses:Housing`, any fee / tax / markup → `Expenses:Financial`; add a second
level for the specifics (`Expenses:Health:Pharmacy`). NEVER emit a non-canonical
root like `Expenses:Medical`, `:Automotive`, `:Utilities`, `:Bank`, or `:Tax`.
Don't invent receivables or equity plugs that aren't called for.

## Points / rewards

Each eligible spend earns at the card's base rate → a `<pool.account>:Pending`
points leg + an `Equity:Void` contra, commodity = the pool's ticker, points =
`floor(amount / per) * pts` on the purchase amount only (never on forex-markup,
fee, or GST legs). EARN BY DEFAULT — a spend earns unless the card's per-category
rules exclude it; judge by the merchant's actual category, not keywords in its
name. Omit the points legs entirely when they round to zero (never a `0` points
leg). A spend or refund missing its points legs is INCOMPLETE unless the card has
no rate at all — and then say you skipped accruals.

**Bonus / promo points** (a 5X promo, milestone, or sign-up reward — not tied to
any single purchase) are EARNED too: accrue each to `<pool.account>:Pending` with
an `Equity:Void` contra. RECONCILE: the total you accrue — per-spend base PLUS
every bonus — must EQUAL the stated "Earned this cycle" exactly: not less (you
missed a bonus or a spend), not more (you double-counted — count a bonus once).

**Landing** (posting earned points to the spendable balance): when an "Earned
this cycle" figure N is known, emit ONE transaction moving N from
`<pool.account>:Pending` to `<pool.account>` (`<pool.account>` +N, `:Pending` −N,
same ticker, NO `Equity:Void`, NO price) — the only way to post pending points; a
pad can't. If NO earned figure is given, do NOT invent a landing — leave the
points in `:Pending`. Every earned point reaches `:Pending` before the landing
moves it out, so after the landing `:Pending` nets to ZERO and is never negative.

A **points balance** (a known closing / current total) is asserted as a pad +
balance — see "Balances" below.

## Cashback vs discount

The split is timing. A **discount** is immediate — it reduced the bill, nothing
to redeem later: a NEGATIVE leg on the same expense, the instrument pays the net,
no plug. **Cashback** is deferred — ₹X posted back separately, redeemable later:
the full purchase + an `Assets:Receivable:<Issuer>` accrual + a matching expense
reduction (the expense leg is the contra — no `Income:Void`); when the issuer
credits it, draw the receivable down against the instrument it lands on.

## Forex (a charge in a foreign currency)

A foreign-currency charge carries TWO DIFFERENT amounts: the transaction amount
in the **foreign currency** and the billed amount in the card's **billing
currency**. They are never equal (currencies don't convert 1:1). The foreign
amount is the posting's quantity + commodity; the billed amount is the `@@`
total. NEVER copy one into the other's slot. The "FOREIGN CURRENCY TRANSACTION
FEE" / "DCC MARKUP" and "GST" that follow a foreign charge belong to it — fold
them in: ONE entry, the foreign amount `@@` the billed amount exactly as given
(do not re-derive), plus the markup and GST as legs in the billing currency, the
card debited for the sum. Pair stray fee/GST to their charge by the **arithmetic,
not adjacency** — markup ≈ 2% of ITS billed amount, GST ≈ 18% of THAT markup.

## Redemption

**Every redemption associates a cash value with the points side via `@@`** —
statement credits, pay-at-merchant, award flights/hotels, hybrid fares alike. The
points leg's weight is the cash equivalent at redemption time. Never guess it
from a fixed cpp rate and never fall back to `Equity:Void` for a redemption.

The shape: the points LEAVE their wallet (`Assets:Rewards:… -<points> COMMODITY @@
<cash> FIAT`) and the **cash value is the expense** (`Expenses:… <cash> FIAT`). The
points commodity NEVER sits on the expense leg — the expense is always in fiat.

**If you do not have the cash value, you MUST `clarify` and ask the user for it**
(one question; the redemption clarify in your tool guidance). Do NOT invent a
number, do NOT book the points themselves as the expense, and do NOT contrive a
points-only entry that balances just to avoid asking — a redemption you can't
value yet is a question, not a guess.

## Balances (assert with a pad)

A balance is asserted as a **pad + balance** pair: the pad absorbs any drift
between the figure and what your entries left in the account, then the balance
asserts the figure. The pad's plug account is chosen by the ACCOUNT TYPE:

- **Reward commodity** (a points / miles balance under `Assets:Rewards:*`) →
  `Equity:Void` — the same contra rewards are minted and burned through.
- **Fiat onboarding** (first-time set of a bank / card / cash balance the account
  never had) → `Equity:Opening-Balances`.
- **Fiat drift correction** (the books disagree with reality on an EXISTING fiat
  balance) → `Equity:Adjustments`.

Assert the figure exactly as given, digit-for-digit. Date the `balance` the day
the figure is as-of (for a statement closing, the day AFTER the period ends), the
`pad` the day before. EXACTLY ONE balance per account — never two, never a `0`
lifted from a non-balance figure. SIGNS for a card/liability balance: amount owed
(normal "Dr") → NEGATIVE; a "Cr" balance (the bank owes you) → POSITIVE.
