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
- Prepaid cards (food wallets, forex cards, store wallets — anything
  you've already loaded with money): `Assets:Prepaid:<Issuer>:<Card>` —
  e.g. `Assets:Prepaid:Sodexo:Meal`, `Assets:Prepaid:HDFC:Forex:Multi`.
  Forex cards live here too; the currency on the posting tells you it's
  foreign.
- Gift cards / vouchers: `Assets:GiftCards:<Merchant>` — e.g.
  `Assets:GiftCards:Amazon`.

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

## Prepaid cards (food wallets, store wallets)

You loaded money in advance; the balance sits as an asset until you
spend it down. Two moves: load (bank → prepaid) and spend (prepaid →
expense).

### Load
```
2026-05-27 * "Sodexo" "Top-up food wallet"
  Assets:Prepaid:Sodexo:Meal    2000.00 INR
  Assets:Bank:HDFC:Savings     -2000.00 INR
```

### Spend
```
2026-05-27 * "Cafe Coffee Day" "Lunch — Sodexo"
  Expenses:Food:Restaurants     400.00 INR
  Assets:Prepaid:Sodexo:Meal   -400.00 INR
```

## Forex cards (prepaid, foreign currency)

Same `Assets:Prepaid` segment — the currency on the posting tells you
it's forex. Loading is a conversion (₹ → foreign), so use `@@` for the
rate. Spending abroad is single-currency in the foreign unit.

### Load
```
2026-05-27 * "HDFC" "Loaded forex card — 1000 USD @ ₹84.50"
  Assets:Prepaid:HDFC:Forex:Multi    1000.00 USD @@ 84500.00 INR
  Assets:Bank:HDFC:Savings         -84500.00 INR
```

### Spend abroad (already in USD — no FX at point of sale)
```
2026-05-30 * "Whole Foods" "Groceries — NYC"
  Expenses:Travel:Food                   50.00 USD
  Assets:Prepaid:HDFC:Forex:Multi      -50.00 USD
```

## Forex spends on a regular INR credit card

**The mechanic, because this trips people up:**
An INR credit card never holds USD (or any foreign currency). When a
foreign-currency charge comes in, the bank converts it to INR at its
own FX rate and posts that INR amount to the card. Then the bank
typically adds a **separate** forex-markup fee (often ~3.5% of the
converted INR), and GST on that fee, as their own line items on the
statement.

So every Indian-bank forex charge has up to three pieces:
1. The merchant amount, converted at the bank's FX rate (INR).
2. A forex markup fee (INR) — bank's cut for doing the conversion.
3. GST on the markup (INR) — Indian-statutory, usually 18%.

Keep the merchant amount in the foreign currency on the expense leg so
the trip's USD total stays meaningful; use `@@` to re-express its
weight in INR for the card balance. The markup and GST are plain INR
expense lines.

### Full shape (markup + GST itemized — closest to what an Indian statement actually shows)
```
2026-05-30 * "Joe's Pizza" "Dinner — NYC ($50 + ₹148 markup + ₹26.64 GST)"
  Expenses:Travel:Food                     50.00 USD @@ 4225.00 INR
  Expenses:Bank:ForexMarkup              148.00 INR
  Expenses:Tax:GST                        26.64 INR
  Liabilities:CreditCards:HDFC:Regalia -4399.64 INR
```

### Markup only (when GST isn't broken out separately)
```
2026-05-30 * "Joe's Pizza" "Dinner — NYC ($50 + ₹148 forex markup)"
  Expenses:Travel:Food                   50.00 USD @@ 4225.00 INR
  Expenses:Bank:ForexMarkup            148.00 INR
  Liabilities:CreditCards:HDFC:Regalia -4373.00 INR
```

### Short form (markup baked into a single INR total)
Use this only when the user can't see the markup split out, or
explicitly wants a single line. The `@@` rate ends up implicitly
including the markup.
```
2026-05-30 * "Joe's Pizza" "Dinner — NYC"
  Expenses:Travel:Food                   50.00 USD @@ 4373.00 INR
  Liabilities:CreditCards:HDFC:Regalia -4373.00 INR
```

## Gift cards / vouchers

A gift card is an asset — value you hold until you spend it.

### Bought with cash or card
```
2026-05-27 * "Amazon" "Bought ₹1000 Amazon gift card"
  Assets:GiftCards:Amazon                1000.00 INR
  Liabilities:CreditCards:HDFC:Regalia  -1000.00 INR
```

### Received as a gift (income)
```
2026-05-27 * "Friend" "Birthday — Amazon gift card"
  Assets:GiftCards:Amazon    1000.00 INR
  Income:Gifts              -1000.00 INR
```

### Redeemed at checkout
Full:
```
2026-05-27 * "Amazon" "Book — paid with gift card"
  Expenses:Shopping:Books     500.00 INR
  Assets:GiftCards:Amazon    -500.00 INR
```

Partial (gift card + card):
```
2026-05-27 * "Amazon" "Book — ₹500 gift card + ₹300 on Regalia"
  Expenses:Shopping:Books                  800.00 INR
  Assets:GiftCards:Amazon                 -500.00 INR
  Liabilities:CreditCards:HDFC:Regalia    -300.00 INR
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

## Redemptions — always associate a cash value

**Hard rule:** every redemption associates a cash value with the points
side via `@@`. There are no exceptions — statement credits, pay-at-
merchant, award flights, award hotels, hybrid fares, all the same shape.
The points leg's weight is the cash equivalent at redemption time
(statement credit amount, cash fare displaced, hotel cash rate, etc.).

### Cashback applied to the statement (same currency)
Settles the receivable from the Cashback pattern. Card liability goes
down, receivable goes back to zero. (Same-currency, so no `@@` needed —
the value is already in INR.)
```
2026-05-31 * "HSBC" "Cashback credited to May statement"
  Liabilities:CreditCards:HSBC:Cashback:9065   3.70 INR
  Assets:Receivable:HSBC                      -3.70 INR
```

### Points redeemed for statement credit
The statement-credit amount IS the cash value.
```
2026-05-31 * "HDFC" "Redeem 1000 pts → ₹250 statement credit"
  Assets:Rewards:HDFC                    -1000 HDFC_RP @@ 250.00 INR
  Liabilities:CreditCards:HDFC:Regalia    250.00 INR
```

### Pay with points at a merchant
Merchant's quoted price IS the cash value. Same shape for partial
redemptions (points + card).
```
2026-05-27 * "Amazon" "Headphones — paid 2500 HDFC pts"
  Expenses:Shopping:Electronics       500.00 INR
  Assets:Rewards:HDFC                 -2500 HDFC_RP @@ 500.00 INR
```
```
2026-05-27 * "Amazon" "Headphones — 2500 pts + ₹500 on card"
  Expenses:Shopping:Electronics            1000.00 INR
  Assets:Rewards:HDFC                      -2500 HDFC_RP @@ 500.00 INR
  Liabilities:CreditCards:HDFC:Regalia    -500.00 INR
```

### Award flight (miles + taxes/fees)
The cash-equivalent fare is the value the miles unlocked. Expense is the
full fare (what the trip "cost" you in honest terms); miles cover the
fare minus the cash co-pay; card / bank pays the co-pay (taxes, fees).

Example: 75k UA miles + ₹5k taxes for a DEL-SFO ticket whose cash fare
is ₹100k → miles' cash value is ₹95k (100k − 5k).
```
2026-05-27 * "United" "Award DEL-SFO — 75k miles + ₹5k taxes (₹100k cash fare)"
  Expenses:Travel:Flights              100000.00 INR
  Assets:Rewards:United                -75000 UA_MILES @@ 95000.00 INR
  Liabilities:CreditCards:HDFC:Regalia  -5000.00 INR
```

### Award hotel night
Same shape — cash-equivalent room rate is the value the points unlocked.
Resort fee / taxes hit the card.
```
2026-05-27 * "Hyatt" "Award night — 40k pts + ₹500 resort fee (₹15k cash rate)"
  Expenses:Travel:Hotels                15000.00 INR
  Assets:Rewards:Hyatt                  -40000 HYATT_PT @@ 14500.00 INR
  Liabilities:CreditCards:HDFC:Regalia   -500.00 INR
```

### Hybrid cash + points fare (Pay-with-Miles / cash-and-points)
Cash + points together cover the full fare. Each side's contribution is
what it actually paid. Below, ₹6k cash fare, 15k 6E points cover ₹5.5k,
₹500 convenience fee on card.
```
2026-05-27 * "Indigo" "DEL-BLR — 15k 6E pts + ₹500 fee (₹6k cash fare)"
  Expenses:Travel:Flights               6000.00 INR
  Assets:Rewards:Indigo                -15000 6E_PT @@ 5500.00 INR
  Liabilities:CreditCards:HDFC:Regalia  -500.00 INR
```

## Bonuses, expiry, and other point-balance adjustments

Earn / write-off events without a conversion rate. Single-currency,
contra is `Equity:Void`. Same shape covers welcome bonuses, anniversary
bonuses, referral bonuses, milestone bonuses, expiry sweeps, clawbacks.

```
2026-05-27 * "AMEX" "Platinum 100k welcome bonus"
  Assets:Rewards:AMEX     100000 AMEX_MR
  Equity:Void            -100000 AMEX_MR
```
```
2026-12-31 * "HDFC" "RP expiry — 2024 vintage points"
  Assets:Rewards:HDFC     -3500 HDFC_RP
  Equity:Void              3500 HDFC_RP
```

## Referrals (you referred someone; reward landed for you)

Shape depends on what the reward actually is. If it's **cash** (lands in
a bank, a wallet, or as a statement credit), the credit side is
`Income:Referrals` because realized cash value is changing hands. If
it's **points / miles**, it's the same shape as a welcome bonus —
single-currency with `Equity:Void`.

### Cash referral credited to bank
```
2026-05-27 * "Niyo" "Referral bonus — Aman signed up"
  Assets:Bank:HDFC:Savings    500.00 INR
  Income:Referrals           -500.00 INR
```

### Cash referral as a statement credit on the card
Card liability goes down; income captures the realized value.
```
2026-05-27 * "HDFC" "Referral statement credit — Aman signed up"
  Liabilities:CreditCards:HDFC:Regalia    1000.00 INR
  Income:Referrals                       -1000.00 INR
```

### Pending cash referral (friend hasn't completed signup yet)
Sit it in a receivable until the issuer actually pays out.
```
2026-05-27 * "HDFC" "Referral promised — Aman card under review"
  Assets:Receivable:HDFC      1000.00 INR
  Income:Referrals           -1000.00 INR
```
When it lands, settle the receivable against the bank / card just like
any other receivable payout.

### Points referral
```
2026-05-27 * "AMEX" "Referral bonus — 15000 MR for referring Aman"
  Assets:Rewards:AMEX     15000 AMEX_MR
  Equity:Void            -15000 AMEX_MR
```

## Buying points with cash

Conversion at a defined rate → `@@` on the points leg. Same shape for
program points (AMEX MR, HDFC RP, …) and FFP miles (United, Lufthansa,
…). No expense — you've shifted INR into a different asset (points).

```
2026-05-27 * "AMEX" "Bought 10000 MR for ₹3000"
  Assets:Rewards:AMEX        10000 AMEX_MR @@ 3000.00 INR
  Assets:Bank:HDFC:Savings  -3000.00 INR
```
```
2026-05-27 * "AMEX" "Bought 10000 MR for ₹3000 on Regalia"
  Assets:Rewards:AMEX                      10000 AMEX_MR @@ 3000.00 INR
  Liabilities:CreditCards:HDFC:Regalia    -3000.00 INR
```

## Redemption refunds (mirror of the original)

Sign-flipped copy of the original redemption — every redemption was
`@@`, so every refund is `@@` too. Use the same cash value the
redemption was booked at.

### Award flight cancelled (miles + taxes come back)
```
2026-05-27 * "United" "Cancelled DEL-SFO — miles + taxes refunded"
  Expenses:Travel:Flights              -100000.00 INR
  Assets:Rewards:United                  75000 UA_MILES @@ 95000.00 INR
  Liabilities:CreditCards:HDFC:Regalia    5000.00 INR
```

### Statement-credit redemption reversed
```
2026-05-27 * "HDFC" "Statement-credit redemption reversed"
  Assets:Rewards:HDFC                    1000 HDFC_RP @@ 250.00 INR
  Liabilities:CreditCards:HDFC:Regalia  -250.00 INR
```

## When to use `@@` vs `Equity:Void` on the point side

- **Any redemption or conversion** — points are being exchanged for
  cash, for a flight, for a hotel night, or for another point currency:
  use `@@` on the point posting with the cash-equivalent value at
  redemption. (Examples: transferring 10k Chase UR → 13k United,
  redeeming points for a statement credit, paying with points at a
  merchant, buying points with cash, award flights, award hotel nights,
  hybrid cash-and-points fares.)
- **Accrual / write-off** — your point balance changes without a
  transaction (no rate is being asserted): use `Equity:Void` as the
  point-side contra. (Examples: earning points on a purchase, welcome
  bonuses, anniversary bonuses, referral bonuses, milestone bonuses,
  expiry sweeps, clawbacks.)

## Balance assertions and pad

These aren't transactions — they're directives the user puts in the
journal alongside transactions. They don't move money; they declare or
correct what's true.

### `balance` — assert what the account holds (start-of-day)

```
2026-06-01 balance Assets:Bank:HDFC:Savings   123456.78 INR
```

Reads: at the **start of 2026-06-01**, the computed balance of
`Assets:Bank:HDFC:Savings` is exactly ₹123,456.78 (sum of all postings
dated **before** 2026-06-01). If it doesn't match, the parser flags an
error. Pure check, no side effect.

Use it for:
- Reconciliation against a statement (your computed balance should
  equal what the bank says).
- A safety net after large data entry — a misposted transaction surfaces
  as a balance mismatch instead of silently drifting.

### `pad` + `balance` — start (or repair) without prior history

A `pad` placed before a `balance` for the same account inserts a
synthetic adjustment dated on the `pad` line that fills exactly the gap
needed to make the next `balance` succeed. The contra goes to the
**second** account on the `pad` line — by convention
`Equity:Opening-Balances` for first-time setup.

```
2026-01-01 pad Assets:Bank:HDFC:Savings   Equity:Opening-Balances
2026-06-01 balance Assets:Bank:HDFC:Savings   123456.78 INR
```

Reads: on 2026-01-01, plug whatever's needed in
`Assets:Bank:HDFC:Savings` (offset to `Equity:Opening-Balances`) so
that on 2026-06-01 the asserted balance of ₹123,456.78 holds.

Use this once per account when you start tracking — you know the
balance today but don't want to back-fill years of history.

A `pad` without a following `balance` for the same account is dropped
by the parser. The pair is the unit.

### How the codebase reads these

Internally, a `pad` immediately preceding a `balance` for the same
account is merged into a single logical entry — a balance with a
`plug_account` field. Unmatched pads are surfaced as unsupported.
That's why you only ever see a `pad` paired with a `balance` in the
editor.

### What the chat tool can do today

The `draft_transaction` tool emits transactions, not directives. So if
the user asks to "set my HDFC balance to ₹X" or "my balance is off by
₹Y, fix it", propose a transaction that plugs to
`Equity:Opening-Balances` and tell the user they can add the `balance`
assertion themselves in the editor afterwards.

```
2026-05-27 * "Opening balance" "Set Assets:Bank:HDFC:Savings"
  Assets:Bank:HDFC:Savings    123456.78 INR
  Equity:Opening-Balances    -123456.78 INR
```

If the user wants to correct drift (their books say ₹100k, statement
says ₹103k), the plug transaction is for the **difference**:
```
2026-05-27 * "Reconcile" "HDFC drift correction"
  Assets:Bank:HDFC:Savings      3000.00 INR
  Equity:Opening-Balances      -3000.00 INR
```
