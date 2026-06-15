# Ledger rules

How money, rewards, and balances are modeled in this ledger. These rules apply
EVERYWHERE — typing a transaction in the editor, importing a statement, any
surface. (Account-path shapes are in the primer; worked examples are in the
examples file.)

## Transaction shape

**First, what KIND of source is this?** A CARD statement / receipt records
PURCHASES (the four-posting shape below). A LOYALTY / POINTS statement records
POINTS MOVEMENTS, classified by SIGN: a `+N` row EARNS — a PLAIN accrual (the
points leg + an `Equity:Void` contra, and NOTHING else: NO `Expenses` leg, NO
`Liabilities:CreditCards` leg, NO `@@` price — even for a flight you flew or a row
labelled "… Credit Card Spends") — and a `-N` row REDEEMS (priced points; see
Redemption). NEVER reconstruct a purchase, invent a fare, or attach a card/expense
leg to a `+N` points-statement row. (Full rules: "Loyalty-statement rows — classify
by the SIGN" below.)

A credit-card **PURCHASE is FOUR postings** by default — write all four as you
write the entry, never as a later pass:

1. the expense leg,
2. the card leg (NEGATIVE — a purchase adds to what you owe),
3. the `<pool.account>:Pending` points accrual,
4. the `Equity:Void` points contra.

A purchase written with only two postings (expense + card) is INCOMPLETE — you
dropped its points. The genuinely two-posting entries are: a payment/credit to
the card, and an issuer fee / interest / standalone GST. A purchase is
two-posting ONLY when the card's earn rules exclude its category or the points
round to zero. (A refund mirrors the purchase it reverses, so it carries the
points legs too when the purchase earned points — see Refunds.)

Each entry is ONE beancount entry — a `transaction` with its posting lines, or a
`balance` / `pad` assertion — which code validates (it does not rewrite it).
Postings MUST balance per currency. For a foreign-currency or points→points
conversion leg, carry the total value with `@@` (in the OTHER commodity) so its
converted value closes against the other leg.

**Transferring points between two programmes** (one loyalty currency → another at
a ratio) — this is NOT a redemption (points → cash/flight/hotel; see Redemption,
where the cash value is given, not a ratio). A ratio `A:B` = A source → B
destination: `destination = source × B/A`, `source = destination × A/B` (divide
exactly; don't flip it). The `@@` price sits on the SOURCE (negative) leg, in the
destination's commodity. Most transfers are a FIX — attributing an existing
accrual to where it came from: the currency already in the entry is the
DESTINATION, so keep that leg unchanged and just replace its `Equity:Void` contra
with the source leg. At `3:2`, an existing 1200 DST accrual came from
`1200 × 3/2 = 1800` SRC:
```beancount
2026-05-01 * "Programme" "Earn"
  Assets:Rewards:Points:Dst   1200 DST            ; unchanged
  Assets:Rewards:Points:Src  -1800 SRC @@ 1200 DST
```

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

## Loyalty-statement rows — classify by the SIGN

A loyalty/points statement (NOT a card statement) lists POINTS movements, and the
SIGN is the classifier: a `+N` row CREDITS points (an EARN), a `-N` row SPENDS them
(a REDEMPTION — see Redemption). NEVER flip an earn into a redemption: a `+N` line is
never a redemption, gets NO `@@` price, and you never invent a fare or cash value
for it. (A flight that EARNED you miles — `AI 123 … +557 Maharaja Points` — is an
EARN: you already paid for that ticket elsewhere. It is NOT an award redemption and
has no fare on this statement to book.)

Most `+N` rows carry NO rupee/fiat figure — a pooling credit, a promo or transfer-in,
points earned on a FLIGHT you flew, points posted from a partner programme or a
co-brand card's spend. A `+N` row is a CREDIT OF POINTS, not a purchase. Record it as
a PLAIN accrual: the points to `<pool.account>` (or `:Pending` if not yet posted) and
an `Equity:Void` contra, both in the pool's commodity — plus a SECOND
`+status / Equity:Void` pair if the row also shows tier/status points (Status counters
below). That is the whole entry.

- NO `Expenses:…` leg and NO `Liabilities:CreditCards:…` leg — in ANY commodity.
  Nothing was bought on this row; the card's actual purchases are recorded from the
  CARD statement, never reconstructed from a loyalty row. This holds even when the
  row is LABELLED "… Credit Card Spends" — that label only says where the points
  came from, not that a purchase belongs here.
- NEVER read the points count as a fiat amount (`+3,576 points` is `3576 <TICKER>`,
  never `₹3576`), and NEVER paper over that by putting the POINTS commodity on an
  expense or card leg. `Expenses:Travel 3576 MAHARAJACLUB` and
  `Liabilities:CreditCards:… -3576 MAHARAJACLUB` are BOTH nonsense: an expense/card
  leg is fiat; a points quantity only ever lives on an `Assets:Rewards:…` (or
  `Equity:Void` contra) leg.
- If the row names another loyalty currency it converted FROM, make it a TRANSFER
  instead (source leg with an `@@` price; see Transfers).

## Status & auxiliary counters

Some programmes track MORE than one quantity. A loyalty statement can show
several parallel columns per row: the spendable reward currency AND one or more
**status counters** — tier-qualifying points, qualifying nights, segments, and
the like. These are INDEPENDENT quantities in DIFFERENT commodities. NEVER sum
them, merge them, convert one into another, or fold a status counter into the
spendable balance — a "+384 / +384 / +2" row is three different things, not one.

- The **spendable reward currency** earns and redeems as usual → `<pool.account>`
  and its `:Pending`, the programme's ticker (Points section above).
- A **status counter is AUXILIARY**: it only accrues, expires, or resets toward a
  tier — it never transfers out, never lands, and never redeems for cash. Book it
  straight to `Assets:Rewards:Status:<Programme>` (the SAME `<Programme>` segment
  as that programme's `Assets:Rewards:Points:<Programme>` account, so the two
  stay aligned), each counter its own commodity, with an `Equity:Void` contra —
  the same mint/burn plug points use. No `:Pending`, no `@@`, no cash value: it is
  a count, not money. Name each counter commodity `<PROG>-NIGHTS`, `<PROG>-STATUS`,
  etc. (short caps programme prefix, plural where the unit is) and REUSE whatever
  ticker already exists for that programme so the balance keeps accumulating.

A single statement row may move several columns at once (one stay can add reward
points, status points, AND nights). Emit ONE transaction with one accrual leg
(+ its `Equity:Void` contra) PER non-empty column — a row with three filled
columns is six postings, not two. A blank / "–" column contributes nothing.

## Cashback vs discount

The split is timing. A **discount** is immediate — it reduced the bill, nothing
to redeem later: a NEGATIVE leg on the same expense, the instrument pays the net,
no plug. **Cashback** is deferred — ₹X posted back separately, redeemable later:
the full purchase (the expense is NOT reduced) + an `Assets:Receivable:<Issuer>`
accrual minted against an `Equity:Void` contra (the same mint/burn plug points
use — NOT a reduction of the expense, NOT `Income:Void`); when the issuer credits
it, draw the receivable down against the instrument it lands on.

## Forex (a charge in a foreign currency)

A foreign-currency charge carries TWO DIFFERENT amounts: the transaction amount
in the **foreign currency** and the billed amount in the card's **billing
currency**. They are never equal (currencies don't convert 1:1). The foreign
amount is the posting's quantity + commodity; the billed amount is the `@@`
total price (in the billing currency). NEVER copy one into the other's slot. The
"FOREIGN CURRENCY TRANSACTION FEE" / "DCC MARKUP" and "GST" that follow a
foreign charge belong to it — fold them in: ONE entry, the foreign amount with
`@@ <billed amount> <billing currency>` exactly as given (do
not re-derive), plus the markup and GST as legs in the billing currency, the
card debited for the sum. Pair stray fee/GST to their charge by the
**arithmetic, not adjacency** — markup ≈ 2% of ITS billed amount, GST ≈ 18% of
THAT markup.

## Redemption

**Recognise it by the SIGN:** points/miles going DOWN (a NEGATIVE points line)
because you SPENT them on something — an award flight or hotel, a voucher, a
statement credit, pay-at-merchant — is a REDEMPTION. This holds even in a bare
loyalty/points statement that shows only a negative points line against a
flight/booking: that negative line is a redemption, NOT a generic points decrease
to write off against `Equity:Void`. A POSITIVE points line is the OPPOSITE — an
EARN (you flew a paid ticket, or got a credit/bonus); it is NEVER a redemption, so
never flip its sign, never give it an `@@` price, and never invent a fare for it
(see "Loyalty-statement rows" above). A flight row earning `+557 miles` is an earn;
do NOT book it as `-557 @@ <made-up fare>`.

**Every redemption associates a cash value with the points side** —
statement credits, pay-at-merchant, award flights/hotels, hybrid fares alike.
On the points posting, carry the cash equivalent as an `@@` total price in the
fiat currency. Never guess the cash value from a fixed cpp
rate and never fall back to `Equity:Void` for a redemption.

The shape: the points LEAVE their wallet (a negative points posting with an
`@@` price carrying the cash equivalent) and the **cash value is the
expense** (`Expenses:… <cash> FIAT`). The points commodity NEVER sits on the
expense leg — the expense is always in fiat.

**If you do not have the cash value, you MUST `clarify` and ask the user for it.**
Do NOT invent a number — not `@@ 0.00`, and equally not a made-up round figure like
a `10000` fare pulled from nowhere (inventing a non-zero value is the SAME sin as
zeroing it; the validator only catches the zero). Do NOT use any zero / placeholder
value (a redemption is never worth nothing — the validator REJECTS a zero `@@`/`@`
price),
do NOT book the points themselves as the expense, do NOT fall back to
`Equity:Void`, and do NOT contrive a points-only entry that balances just to avoid
asking — a redemption you can't value yet is a question, not a guess. This holds
**mid-batch**: when the rest of a statement is fine but a redemption has no cash
value, EITHER draft the other rows now and hold the redemption back for the clarify
(or draft it flagged `!`), OR ask first and draft the whole batch once you have the
value — either is fine; what is NOT fine is zeroing the redemption to keep the batch
moving. When SEVERAL redemptions lack a value, ask for EACH one separately and apply
each answer to its own row only; never reuse one number across distinct flights/stays.

## Balances (assert with a pad)

A balance is asserted as a **pad + balance** pair: the pad
absorbs any drift between the figure and what your entries left in the account,
then the balance asserts the figure. **The pad always plugs from `Equity:Void`**
— for every account type (reward, bank, card, cash). Write the plug as
`Equity:Void` on the pad line. (If the running balance already equals the figure
exactly and needs no reconciliation, use a bare `balance` line instead — no pad.)

This is the PAD plug ONLY. It does NOT license burning points to `Equity:Void` in
a normal transaction: a points balance going DOWN in a transaction is a
redemption / transfer-out / expiry (see Redemption), never a bare burn to Void.

Assert the figure exactly as given, digit-for-digit. Date the `balance` the day
the figure is as-of (for a statement closing, the day AFTER the period ends), the
`pad` the day before. EXACTLY ONE balance per account — never two, never a `0`
lifted from a non-balance figure. SIGNS for a card/liability balance: amount owed
(normal "Dr") → NEGATIVE; a "Cr" balance (the bank owes you) → POSITIVE.
