# Examples

One transaction captures the purchase AND the reward it earned. Cashback
and points don't fall out of the sky — they always pair with the expense
that generated them.

The accounts below use `<Issuer>`/`<Card>` placeholders on purpose:
these examples teach the *shape* of each entry, not how any specific
card behaves. Fill in the real issuer and card from the transaction in
front of you. Point commodities use `RWD_PTS` (and `SRC_PTS`/`DST_PTS`
for transfers) as a stand-in ticker — **always replace with the
program's actual ticker** (e.g. `EDGE_PTS`, `RP`, `MR`, `UR`, `MILES`,
whatever the program calls its unit). Never emit `RWD_PTS` in real
output, and never emit angle brackets — they are markdown placeholders,
not Beancount syntax. Card-specific routing (where a given program's
points land, the earn rate) is not assumed here.

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
  — e.g. `Liabilities:CreditCards:<Issuer>:<Card>` or
  `Liabilities:CreditCards:<Issuer>:<Card>:<Id>`.
- Cashback receivable (cash owed, lands later on a statement):
  `Assets:Receivable:<Issuer>` — singular `Receivable`, then the issuer
  (NOT the card name, NOT `Cashback`, NOT plural).
- Held points / miles balance (already in your account, not "owed"):
  `Assets:Rewards:<Issuer>`. Use this for any point-currency balance.
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
  Liabilities:CreditCards:<Issuer>:<Card>   -37.00 INR
  Assets:Receivable:<Issuer>                  3.70 INR
  Expenses:Food:Coffee                       -3.70 INR
```

INR sums to zero. Net expense to dashboards = ₹33.30; card paid ₹37;
receivable accrues ₹3.70.

## Points pattern (words: "points", "miles")

Multi-currency single transaction: purchase legs in INR/USD, points legs
in the program's point currency. No expense-reduction leg — points'
cash value isn't fixed at earn time.

```
2026-05-21 * "Taj" "Dinner — 250 reward points"
  Expenses:Food:Restaurants                  2500.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>   -2500.00 INR
  Assets:Rewards:<Issuer>                         250 RWD_PTS
  Equity:Void                                    -250 RWD_PTS
```

Each currency balances on its own. **The point currency MUST sum to
zero too** — the `Assets:Rewards` leg ALWAYS needs its `Equity:Void`
contra with the equal-and-opposite amount in the SAME point currency.
A three-posting variant with only `Assets:Rewards` and no contra is
rejected by the parser. Replace `RWD_PTS` with the program's actual
ticker (e.g. `EDGE_PTS`, `RP`, `MR`); never emit `RWD_PTS` literally,
and never emit angle-bracket currencies like `<EdgeRewards>` —
Beancount has no such syntax.

### Computing earn from a stated rate

Two different shapes — don't conflate them:

- **Block-based points/miles** ("12 points per ₹200 spent") →
  `floor(amount / 200) * 12`. Points accrue per whole block, so floor.
  Uses the Points pattern.
- **Percentage cashback** ("10% cashback") → `amount * 0.10`, exact, NO
  floor. It's a cash value, so it follows the Cashback pattern (instant
  discount vs deferred — clarify if ambiguous), not the Points pattern.

Either way: compute on the **purchase amount only** — never on
forex-markup, fee, or GST legs. A refund reverses what its amount would
have earned. Omit the reward legs when they round/compute to zero. This is
the default — don't deliberate; `clarify` only if the rate itself or the
discount-vs-cashback question is genuinely ambiguous.

When a stated earn rate applies to a batch (e.g. a whole statement), add
the reward legs to EVERY qualifying transaction — do not skip the first
row or any row. A row earns zero only if its amount rounds to zero blocks.

## Instant cashback (discount at purchase)

ONLY when the user says the discount/cashback was applied at the point of
sale — i.e. it reduced the bill they paid, nothing to redeem later. A
negative posting on the same expense; no `Equity:Void`, no receivable.

```
2026-05-21 * "Swiggy" "Dinner — ₹50 instant cashback"
  Expenses:Food:Restaurants                  500.00 INR
  Expenses:Food:Restaurants                  -50.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>   -450.00 INR
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
2026-05-26 * "Card payment" "May bill"
  Liabilities:CreditCards:<Issuer>:<Card>   45000.00 INR
  Assets:Bank:HDFC:Savings                 -45000.00 INR
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
2026-05-27 * "Forex load" "Loaded forex card — 1000 USD @ ₹84.50"
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
  Expenses:Travel:Food                       50.00 USD @@ 4225.00 INR
  Expenses:Bank:ForexMarkup                 148.00 INR
  Expenses:Tax:GST                           26.64 INR
  Liabilities:CreditCards:<Issuer>:<Card>  -4399.64 INR
```

### Markup only (when GST isn't broken out separately)
```
2026-05-30 * "Joe's Pizza" "Dinner — NYC ($50 + ₹148 forex markup)"
  Expenses:Travel:Food                       50.00 USD @@ 4225.00 INR
  Expenses:Bank:ForexMarkup                 148.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>  -4373.00 INR
```

### Short form (markup baked into a single INR total)
Use this only when the user can't see the markup split out, or
explicitly wants a single line. The `@@` rate ends up implicitly
including the markup.
```
2026-05-30 * "Joe's Pizza" "Dinner — NYC"
  Expenses:Travel:Food                       50.00 USD @@ 4373.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>  -4373.00 INR
```

### When the statement itemizes the markup / GST on separate rows (fold them in)
Indian statements usually print the merchant charge, the **"FOREIGN
CURRENCY TRANSACTION FEE"** (or **"DCC MARKUP"**), and the **"GST"** as
three separate rows — often dated a day or two apart, sometimes
interleaved with other transactions. They are NOT three transactions.
They are ONE: fold the fee and GST back into the merchant's transaction.

- The `@@` INR weight is the merchant's billed INR amount **exactly as
  shown on that row** — do NOT re-derive, round, or "back out" the fee
  from it. Re-deriving the rate is the most common mistake; the billed
  INR is printed, use it verbatim.
- The markup fee and its GST are their own plain INR legs
  (`Expenses:Bank:ForexMarkup`, `Expenses:Tax:GST`).
- The card liability is the **sum of all three**: billed INR + markup +
  GST. The transaction balances on that sum, not on the billed amount
  alone.

To pair a stray fee/GST row with the charge it belongs to: the markup is
the card's forex rate (commonly **2%**) of the billed INR, and the GST is
**18% of that markup**. Match by that arithmetic. E.g. an ₹875.30 charge
→ ₹17.51 markup (2% of 875.30) → ₹3.15 GST (18% of 17.51), so the card is
debited 875.30 + 17.51 + 3.15 = 895.96:
```
2026-04-26 * "Cloudflare" "Hosting (USD 9.28 + ₹17.51 markup + ₹3.15 GST)"
  Expenses:Software:Hosting                  9.28 USD @@ 875.30 INR
  Expenses:Bank:ForexMarkup                 17.51 INR
  Expenses:Tax:GST                           3.15 INR
  Liabilities:CreditCards:<Issuer>:<Card>  -895.96 INR
```
A "DCC MARKUP" row works identically — same fold, same `Expenses:Bank:ForexMarkup`
leg — even when the merchant charge is billed straight in INR (no USD
shown), in which case the expense leg is plain INR with no `@@`.

## Gift cards / vouchers

A gift card is an asset — value you hold until you spend it.

### Bought with cash or card
```
2026-05-27 * "Amazon" "Bought ₹1000 Amazon gift card"
  Assets:GiftCards:Amazon                   1000.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>  -1000.00 INR
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
2026-05-27 * "Amazon" "Book — ₹500 gift card + ₹300 on card"
  Expenses:Shopping:Books                   800.00 INR
  Assets:GiftCards:Amazon                  -500.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>  -300.00 INR
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
  Expenses:Food:Restaurants                 1500.00 INR
  Assets:Receivable:Rohan                   1500.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>  -3000.00 INR
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
  Assets:Receivable:ACME                    500.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>  -500.00 INR
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
  Expenses:Shopping:Electronics            -3500.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>   3500.00 INR
```

On a statement, a row marked **`Cr`** / **"Credit"** that is NOT a bill
payment is a refund — it follows this shape: the expense leg is
**negative**, the card leg **positive** (a credit reduces what you owe).
Each `Cr` row is its own transaction; do NOT net two credits into one, and
do NOT collapse a refund into a receivable. Two identical ₹877.82 `Cr`
rows are two separate refunds, each `−877.82` expense / `+877.82` card.

## Points transfers between programs

Moving points from one program to another at a defined rate — always a
conversion, so the rate lives in `@@`. The ratio (1:1, 1:1.3, 1:2,
whatever bonus is running) doesn't change the shape; it just changes
the two numbers. `<Src>` / `SRC_PTS` is the program you transfer from,
`<Dest>` / `DST_PTS` the one you transfer to. Replace both names with
the real programs (e.g. `Axis`/`EDGE_PTS` → `Marriott`/`BONVOY`); never
emit `SRC_PTS`/`DST_PTS` literally in output.

### Instant landing (points show up in the destination right away)
```
2026-05-27 * "Transfer" "10000 source pts → 13000 dest (30% bonus)"
  Assets:Rewards:<Dest>     13000 DST_PTS @@ 10000 SRC_PTS
  Assets:Rewards:<Src>     -10000 SRC_PTS
```

### Pending (transfer initiated but points haven't landed yet)
Mirror of the cashback-vs-discount split: until the destination program
posts the points, they're owed by that program — sit them in a
receivable.
```
2026-05-27 * "Transfer" "10000 source pts → 13000 dest (pending)"
  Assets:Receivable:<Dest>     13000 DST_PTS @@ 10000 SRC_PTS
  Assets:Rewards:<Src>        -10000 SRC_PTS
```

When the points land, settle the receivable:
```
2026-05-30 * "Transfer credited" "Dest program posted the points"
  Assets:Rewards:<Dest>        13000 DST_PTS
  Assets:Receivable:<Dest>    -13000 DST_PTS
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
2026-05-31 * "Statement credit" "Cashback credited to May statement"
  Liabilities:CreditCards:<Issuer>:<Card>    3.70 INR
  Assets:Receivable:<Issuer>                -3.70 INR
```

### Points redeemed for statement credit
The statement-credit amount IS the cash value.
```
2026-05-31 * "Statement credit" "Redeem 1000 pts → ₹250 statement credit"
  Assets:Rewards:<Issuer>                  -1000 RWD_PTS @@ 250.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>   250.00 INR
```

### Pay with points at a merchant
Merchant's quoted price IS the cash value. Same shape for partial
redemptions (points + card).
```
2026-05-27 * "Amazon" "Headphones — paid 2500 pts"
  Expenses:Shopping:Electronics       500.00 INR
  Assets:Rewards:<Issuer>            -2500 RWD_PTS @@ 500.00 INR
```
```
2026-05-27 * "Amazon" "Headphones — 2500 pts + ₹500 on card"
  Expenses:Shopping:Electronics            1000.00 INR
  Assets:Rewards:<Issuer>                  -2500 RWD_PTS @@ 500.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>  -500.00 INR
```

### Award flight (miles + taxes/fees)
The cash-equivalent fare is the value the miles unlocked. Expense is the
full fare (what the trip "cost" you in honest terms); miles cover the
fare minus the cash co-pay; card / bank pays the co-pay (taxes, fees).

Example: 75k miles + ₹5k taxes for a DEL-SFO ticket whose cash fare
is ₹100k → miles' cash value is ₹95k (100k − 5k).
```
2026-05-27 * "Airline" "Award DEL-SFO — 75k miles + ₹5k taxes (₹100k cash fare)"
  Expenses:Travel:Flights                  100000.00 INR
  Assets:Rewards:<Issuer>                   -75000 RWD_PTS @@ 95000.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>    -5000.00 INR
```

### Award hotel night
Same shape — cash-equivalent room rate is the value the points unlocked.
Resort fee / taxes hit the card.
```
2026-05-27 * "Hotel" "Award night — 40k pts + ₹500 resort fee (₹15k cash rate)"
  Expenses:Travel:Hotels                    15000.00 INR
  Assets:Rewards:<Issuer>                   -40000 RWD_PTS @@ 14500.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>    -500.00 INR
```

### Hybrid cash + points fare (Pay-with-Miles / cash-and-points)
Cash + points together cover the full fare. Each side's contribution is
what it actually paid. Below, ₹6k cash fare, 15k points cover ₹5.5k,
₹500 convenience fee on card.
```
2026-05-27 * "Airline" "DEL-BLR — 15k pts + ₹500 fee (₹6k cash fare)"
  Expenses:Travel:Flights                   6000.00 INR
  Assets:Rewards:<Issuer>                   -15000 RWD_PTS @@ 5500.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>   -500.00 INR
```

## Bonuses, expiry, and other point-balance adjustments

Earn / write-off events without a conversion rate. Single-currency,
contra is `Equity:Void`. Same shape covers welcome bonuses, anniversary
bonuses, referral bonuses, milestone bonuses, expiry sweeps, clawbacks.

```
2026-05-27 * "Welcome bonus" "100k welcome bonus"
  Assets:Rewards:<Issuer>     100000 RWD_PTS
  Equity:Void                -100000 RWD_PTS
```
```
2026-12-31 * "Points expiry" "Expired 2024 vintage points"
  Assets:Rewards:<Issuer>     -3500 RWD_PTS
  Equity:Void                  3500 RWD_PTS
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
2026-05-27 * "Referral credit" "Referral statement credit — Aman signed up"
  Liabilities:CreditCards:<Issuer>:<Card>   1000.00 INR
  Income:Referrals                         -1000.00 INR
```

### Pending cash referral (friend hasn't completed signup yet)
Sit it in a receivable until the issuer actually pays out.
```
2026-05-27 * "Referral promised" "Aman card under review"
  Assets:Receivable:<Issuer>   1000.00 INR
  Income:Referrals            -1000.00 INR
```
When it lands, settle the receivable against the bank / card just like
any other receivable payout.

### Points referral
```
2026-05-27 * "Referral bonus" "15000 pts for referring Aman"
  Assets:Rewards:<Issuer>     15000 RWD_PTS
  Equity:Void                -15000 RWD_PTS
```

## Buying points with cash

Conversion at a defined rate → `@@` on the points leg. Same shape for
program points and airline miles alike. No expense — you've shifted INR
into a different asset (points).

```
2026-05-27 * "Buy points" "Bought 10000 pts for ₹3000"
  Assets:Rewards:<Issuer>    10000 RWD_PTS @@ 3000.00 INR
  Assets:Bank:HDFC:Savings  -3000.00 INR
```
```
2026-05-27 * "Buy points" "Bought 10000 pts for ₹3000 on card"
  Assets:Rewards:<Issuer>                  10000 RWD_PTS @@ 3000.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>  -3000.00 INR
```

## Redemption refunds (mirror of the original)

Sign-flipped copy of the original redemption — every redemption was
`@@`, so every refund is `@@` too. Use the same cash value the
redemption was booked at.

### Award flight cancelled (miles + taxes come back)
```
2026-05-27 * "Airline" "Cancelled DEL-SFO — miles + taxes refunded"
  Expenses:Travel:Flights                  -100000.00 INR
  Assets:Rewards:<Issuer>                    75000 RWD_PTS @@ 95000.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>     5000.00 INR
```

### Statement-credit redemption reversed
```
2026-05-27 * "Statement credit" "Statement-credit redemption reversed"
  Assets:Rewards:<Issuer>                   1000 RWD_PTS @@ 250.00 INR
  Liabilities:CreditCards:<Issuer>:<Card>  -250.00 INR
```

## When to use `@@` vs `Equity:Void` on the point side

- **Any redemption or conversion** — points are being exchanged for
  cash, for a flight, for a hotel night, or for another point currency:
  use `@@` on the point posting with the cash-equivalent value at
  redemption. (Examples: transferring points between programs,
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
