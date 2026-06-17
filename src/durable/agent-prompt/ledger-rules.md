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
a ratio) — NOT a redemption (points → cash/flight/hotel; see Redemption, where a
cash value is given, not a ratio). A ratio `A:B` means A SOURCE → B DESTINATION:
`source = destination × A/B`, `destination = source × B/A` (divide exactly; don't
flip the ratio). The `@@` price ALWAYS sits on the leg that DECREASES — the SOURCE
(negative) leg — in the DESTINATION's commodity, equal to the destination amount.
NEVER put the `@@` on the destination (positive) leg.

Most transfers are a FIX — re-attributing an existing accrual to the source it
actually came from. The currency already in the entry is the DESTINATION. Do it
EXACTLY as a TWO-leg entry:
1. KEEP the destination leg byte-for-byte — same account, amount, AND commodity.
   NEVER recompute, scale, or re-price it; it is what was actually earned.
2. The source leg REPLACES the `Equity:Void` contra — delete the `Equity:Void`,
   it is NEVER kept alongside the source leg (an extra `Equity:Void` leaves the
   source commodity unbalanced). Final entry has exactly 2 legs: destination +
   source.
3. The source leg is NEGATIVE, in the source commodity, carrying
   `@@ <destination amount> <destination commodity>`. Source amount =
   destination × A/B. Use the source programme's REAL pool account + ticker
   (from `card_guide` / `list_reward_accounts`) — never a generic
   `Assets:Rewards:<Issuer>`.

At `3:2` (3 SRC → 2 DST), an existing 1200 DST accrual came from `1200 × 3/2 =
1800` SRC:
```beancount
2026-05-01 * "Programme" "Earn"
  Assets:Rewards:Points:Dst   1200 DST             ; KEPT, untouched
  Assets:Rewards:Points:Src  -1800 SRC @@ 1200 DST ; replaces the Equity:Void contra
```
WRONG — scaling the destination, pricing the wrong leg, or keeping `Equity:Void`:
```beancount
  Assets:Rewards:Points:Dst    800 DST @@ 1800 SRC  ; ✗ dest recomputed; @@ on dest
  Assets:Rewards:Points:Src  -1800 SRC              ; ✗
  Equity:Void                -1800 SRC              ; ✗ extra leg → unbalanced
```

## Payments to the card

A payment/credit to the card REDUCES what you owe, so the card leg is POSITIVE
and the counter leg is `Assets:Clearing:CardPayments` (NEGATIVE) — equal
magnitudes, opposite signs, summing to zero. Use the clearing account ALWAYS,
even when the user says they paid "from my bank" — do NOT debit a bank account
(e.g. `Assets:Bank:…`) directly; the bank side arrives via its own statement
import and settles the clearing leg, so debiting the bank here double-counts.
Payments earn no points.

## Refunds

A credit that is NOT a bill payment reverses a purchase: NEGATIVE expense leg,
POSITIVE card leg, and the purchase's points REVERSED — the same four-posting
shape mirrored, points computed on the refunded amount. Keep each refund as its
own entry; never net two together or fold a refund into a receivable.

## Categories — the ten canonical expense roots

Every expense leg is denominated in a FIAT currency — a 3-letter ISO code like
`INR` or `USD`, NEVER a points/miles/reward commodity (those live only on
`Assets:Rewards` legs). `Expenses:Travel 3576 RWD_PTS` is invalid and the
validator rejects it.

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
Don't invent receivables or equity plugs that aren't called for. When an account
DOES match the user's open list, use it verbatim — never substitute a different,
real-world account whose name merely resembles it (e.g. don't post to a famous
card/programme you happen to know in place of the user's held one).

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
for it. (A flight that EARNED you miles — `SA 123 … +557 reward miles` — is an
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
  expense or card leg. `Expenses:Travel 3576 RWD_PTS` and
  `Liabilities:CreditCards:… -3576 RWD_PTS` are BOTH nonsense: an expense/card
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
to redeem later: the FULL bill on the expense + a NEGATIVE discount leg on the
SAME expense, and the instrument pays the NET (bill − discount — a SMALLER figure
than the bill), no plug. E.g. a ₹500 bill with ₹50 off → `Expenses:… 500`,
`Expenses:… -50`, card `-450`. The discount leg is NEGATIVE; never record both
legs positive (that charges the full bill and applies no discount).

**Cashback** is deferred — ₹X posted back separately, redeemable later. UNLIKE a
discount, cashback does NOT touch the expense or the card: the expense stays the
FULL bill, the card pays the FULL bill, and the cashback is a SEPARATE
`Assets:Receivable:<Issuer>` accrual minted against an `Equity:Void` contra (the
same mint/burn plug points use — NOT `Income:Void`). When the issuer credits it,
draw the receivable down against the instrument it lands on.

```beancount
2026-05-21 * "Store" "Groceries — ₹50 cashback"
  Expenses:Food:Groceries          1000 INR
  Liabilities:CreditCards:<Card>  -1000 INR
  Assets:Receivable:<Issuer>         50 INR
  Equity:Void                       -50 INR
```
WRONG — reducing the bill (that is a DISCOUNT) AND adding the receivable
double-counts the cashback:
```beancount
  Expenses:Food:Groceries          1000 INR
  Expenses:Food:Groceries           -50 INR   ; ✗ no negative expense leg on cashback
  Liabilities:CreditCards:<Card>   -950 INR   ; ✗ card pays the FULL 1000, not 950
  Assets:Receivable:<Issuer>         50 INR
```

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

The shape is EXACTLY TWO legs — no more: the **cash value as the expense**
(`Expenses:… <cash> FIAT`) and the points LEAVING their wallet
(`Assets:Rewards:… -N PTS @@ <cash> FIAT`). The points ARE the payment, so there
is **NO card leg, NO `Equity:Void`, NO points accrual** — you did not pay a card
and you earned nothing. An award flight or hotel is a REDEMPTION, NOT a purchase:
do NOT reconstruct a paid-ticket entry, and do NOT invent the card it was "paid"
on — there is no card. The points commodity NEVER sits on the expense leg; the
expense is always fiat.

```beancount
2026-01-16 * "Airline" "Award flight — points redemption"
  Expenses:Travel:Flights        <cash> INR
  Assets:Rewards:Miles:<Prog>   -13500 PTS @@ <cash> INR
```
WRONG — reconstructing a paid ticket (a `-N` flight is a redemption, not a buy):
```beancount
  Expenses:Travel:Flights         <made-up> INR  ; ✗ invented fare
  Liabilities:CreditCards:<Card>  -<made-up> INR ; ✗ NO card — the points paid
```

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
then the balance asserts the figure. A balance-set is always a FRESH entry — emit
the pad + balance as a NEW draft with NO `replaces`; never frame it as an edit of
an existing entry, even if you `search`ed and found related rows in that account.
**The pad always plugs from `Equity:Void`**
— for every account type (reward, bank, card, cash). Write the plug as
`Equity:Void` on the pad line. (If the running balance already equals the figure
exactly and needs no reconciliation, use a bare `balance` line instead — no pad.)

This is the PAD plug ONLY. It does NOT license burning points to `Equity:Void` in
a normal transaction: a points balance going DOWN in a transaction is a
redemption / transfer-out / expiry (see Redemption), never a bare burn to Void.

Assert the figure exactly as given, digit-for-digit. Date the `balance` the day
the figure is as-of (for a statement closing, the day AFTER the period ends), the
`pad` the day before. EXACTLY ONE balance per account — never two, never a `0`
lifted from a non-balance figure. SIGN a card/liability balance from the figure's
printed Cr/Dr suffix — find that suffix and let it ALONE decide the sign: a plain
or "Dr" amount (what you OWE) asserts NEGATIVE; a "Cr" amount (you have OVERPAID, so
the issuer must refund you) asserts POSITIVE. The suffix is INDEPENDENT of the
transactions: a card whose every charge is a "Dr" purchase can still CLOSE "Cr", and
those purchase signs say NOTHING about the closing balance — never let a page of
"Dr" rows drag it negative. Read the total's Cr/Dr suffix, never the bare number;
"Cr" closings are uncommon, so resist the reflex to default negative. The suffix
sets only the SIGN: the amount you write is ALWAYS `<number> <CURRENCY>` (INR, or
the points ticker). The Cr/Dr mark is a sign cue, NEVER the commodity — drop it
once it has set the sign; it never appears on the `balance` line.
