# Examples

One transaction captures the purchase AND the reward it earned. Cashback
and points don't fall out of the sky — they always pair with the expense
that generated them.

Every entry also needs a unique short `id` (e.g. `"e1"`), omitted in these examples for brevity.

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

**Fill `<Issuer>` / `<Card>` / the reward-currency leaf from the knowledge
graph — don't invent them.** Each bank, card, and loyalty currency carries a
canonical `beancountName`. When you can recognise the card or programme behind a
transaction, resolve each piece by name and read `attrs.beancountName` from
`kb_get`:
- `<Issuer>` → `kb_resolve(<bank name>, prefix='bank')` → `kb_get(slug)` →
  `attrs.beancountName` (e.g. "Axis Bank" → `Axis`).
- `<Card>` → `kb_resolve(<card name>, prefix='cc')` → `kb_get(slug)` →
  `attrs.beancountName` (e.g. "Select Plus" → `SelectPlus`), giving
  `Liabilities:CreditCards:Axis:SelectPlus`.
- Reward currency → `kb_resolve(<currency name or ticker>, prefix='currency')`
  → `kb_get(slug)`. Two attrs matter: `ticker` is the Beancount COMMODITY
  (always use it for the point amounts — `HDFC-RP`, `AXIS-RP`, `MR`,
  `KRISFLYER`), and `beancountName` is the account leaf. The account path
  depends on the programme's kind:
  - airline FFP → `Assets:Rewards:Miles:<beancountName>`
  - hotel / other programme → `Assets:Rewards:Points:<beancountName>`
  - bank/card pool → `Assets:Rewards:<bank.beancountName>` (ONE account per issuer wallet — the commodity ticker carries which pool/tier the points are)
  Below, `<RewardsAcct>` stands for that full programme account.

Prefer an account that already exists in the user's ledger if it clearly matches;
otherwise use these canonical KG names. Only fall back to a best-guess segment
when the KG has no match for the card/programme.

- Credit cards: `Liabilities:CreditCards:<Issuer>:<Card>[:<Id>]`
  — e.g. `Liabilities:CreditCards:<Issuer>:<Card>` or
  `Liabilities:CreditCards:<Issuer>:<Card>:<Id>`.
- Earned-but-not-credited POINTS/MILES (purchase points before statement
  close, flight miles before the airline posts): the programme account's
  `:Pending` child — `<RewardsAcct>:Pending`, same point currency. NOT
  `Assets:Receivable` (that is for CASH owed: cashback awaiting a
  statement credit stays `Assets:Receivable:<Issuer>` in INR).
- Posted points / miles balance (credited; redeemable today):
  `<RewardsAcct>` itself.
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

```json
{
  "kind": "transaction",
  "date": "2026-05-21",
  "flag": "*",
  "payee": "Starbucks",
  "narration": "Coffee — ₹3.70 cashback",
  "postings": [
    { "account": "Expenses:Food:Coffee", "amount": 37.00, "currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": -37.00, "currency": "INR" },
    { "account": "Assets:Receivable:<Issuer>", "amount": 3.70, "currency": "INR" },
    { "account": "Expenses:Food:Coffee", "amount": -3.70, "currency": "INR" }
  ]
}
```

INR sums to zero. Net expense to dashboards = ₹33.30; card paid ₹37;
receivable accrues ₹3.70.

## Points pattern (words: "points", "miles")

**Two-step lifecycle.** Points earned on a purchase are NOT in your
balance yet — the issuer owes them to you until the next statement
posts. Earn goes to `<RewardsAcct>:Pending`. Only when the issuer
actually credits the points does the balance move to the parent
`<RewardsAcct>`. Never write earn-on-purchase straight to the parent —
that skips the pending step the user explicitly wants tracked.

### Earn (on a purchase)
Multi-currency single transaction: purchase legs in INR/USD, points
legs in the program's point currency. No expense-reduction leg —
points' cash value isn't fixed at earn time.

```json
{
  "kind": "transaction",
  "date": "2026-05-21",
  "flag": "*",
  "payee": "Taj",
  "narration": "Dinner — 250 reward points",
  "postings": [
    { "account": "Expenses:Food:Restaurants", "amount": 2500.00, "currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": -2500.00, "currency": "INR" },
    { "account": "<RewardsAcct>:Pending", "amount": 250, "currency": "RWD_PTS" },
    { "account": "Equity:Void", "amount": -250, "currency": "RWD_PTS" }
  ]
}
```

Each currency balances on its own. **The point currency MUST sum to
zero too** — the `:Pending` leg ALWAYS needs its `Equity:Void`
contra with the equal-and-opposite amount in the SAME point currency.
A three-posting variant with only the points leg and no contra is
rejected by the parser. Replace `RWD_PTS` with the KG currency node's
`ticker` (e.g. `HDFC-RP`, `AXIS-RP`, `MR`); never emit `RWD_PTS` literally,
and never emit angle-bracket currencies like `<reward points>` —
Beancount has no such syntax.

### Landing (issuer posts the points to your balance)
Pure shuffle between two of your own accounts. No expense, no income,
no `Equity:Void` — pending down, posted up, in the same point
currency. Use the statement-close date (or whatever date the issuer
posted them).

```json
{
  "kind": "transaction",
  "date": "2026-06-01",
  "flag": "*",
  "payee": "Statement close",
  "narration": "Posted Apr–May reward points",
  "postings": [
    { "account": "<RewardsAcct>", "amount": 1850, "currency": "RWD_PTS" },
    { "account": "<RewardsAcct>:Pending", "amount": -1850, "currency": "RWD_PTS" }
  ]
}
```

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

```json
{
  "kind": "transaction",
  "date": "2026-05-21",
  "flag": "*",
  "payee": "Swiggy",
  "narration": "Dinner — ₹50 instant cashback",
  "postings": [
    { "account": "Expenses:Food:Restaurants", "amount": 500.00, "currency": "INR" },
    { "account": "Expenses:Food:Restaurants", "amount": -50.00, "currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": -450.00, "currency": "INR" }
  ]
}
```

## Transfers (money moves between your accounts — no expense)

### Salary received
Income postings are negative — that's the Beancount sign convention for
a credit to your books.
```json
{
  "kind": "transaction",
  "date": "2026-05-25",
  "flag": "*",
  "payee": "ACME Corp",
  "narration": "May salary",
  "postings": [
    { "account": "Assets:Bank:HDFC:Savings", "amount": 125000.00, "currency": "INR" },
    { "account": "Income:Salary", "amount": -125000.00, "currency": "INR" }
  ]
}
```

### Bank → bank (your own accounts)
Pure shuffle between accounts you own. No expense, no income.
```json
{
  "kind": "transaction",
  "date": "2026-05-26",
  "flag": "*",
  "payee": "Self",
  "narration": "Move to ICICI for rent",
  "postings": [
    { "account": "Assets:Bank:ICICI:Savings", "amount": 50000.00, "currency": "INR" },
    { "account": "Assets:Bank:HDFC:Savings", "amount": -50000.00, "currency": "INR" }
  ]
}
```

### ATM withdrawal (bank → cash)
```json
{
  "kind": "transaction",
  "date": "2026-05-26",
  "flag": "*",
  "payee": "ATM",
  "narration": "Cash withdrawal",
  "postings": [
    { "account": "Assets:Cash", "amount": 2000.00, "currency": "INR" },
    { "account": "Assets:Bank:HDFC:Savings", "amount": -2000.00, "currency": "INR" }
  ]
}
```

### Credit-card bill payment (bank → card)
Mirror of a purchase. The card leg is positive (reducing the liability),
the bank leg is negative.
```json
{
  "kind": "transaction",
  "date": "2026-05-26",
  "flag": "*",
  "payee": "Card payment",
  "narration": "May bill",
  "postings": [
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": 45000.00, "currency": "INR" },
    { "account": "Assets:Bank:HDFC:Savings", "amount": -45000.00, "currency": "INR" }
  ]
}
```

## Cash and UPI spends

UPI from a regular bank account behaves exactly like cash — money leaves
the bank instantly, no liability in between. Same shape on both: expense
on one side, bank/cash on the other.

(UPI on a credit card is a separate case — that hits the card liability
like any other charge.)

```json
{
  "kind": "transaction",
  "date": "2026-05-26",
  "flag": "*",
  "payee": "Chai shop",
  "narration": "Tea",
  "postings": [
    { "account": "Expenses:Food:Beverages", "amount": 30.00, "currency": "INR" },
    { "account": "Assets:Cash", "amount": -30.00, "currency": "INR" }
  ]
}
```

```json
{
  "kind": "transaction",
  "date": "2026-05-26",
  "flag": "*",
  "payee": "Auto driver",
  "narration": "UPI — ride home",
  "postings": [
    { "account": "Expenses:Travel:Auto", "amount": 120.00, "currency": "INR" },
    { "account": "Assets:Bank:HDFC:Savings", "amount": -120.00, "currency": "INR" }
  ]
}
```

## Prepaid cards (food wallets, store wallets)

You loaded money in advance; the balance sits as an asset until you
spend it down. Two moves: load (bank → prepaid) and spend (prepaid →
expense).

### Load
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Sodexo",
  "narration": "Top-up food wallet",
  "postings": [
    { "account": "Assets:Prepaid:Sodexo:Meal", "amount": 2000.00, "currency": "INR" },
    { "account": "Assets:Bank:HDFC:Savings", "amount": -2000.00, "currency": "INR" }
  ]
}
```

### Spend
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Cafe Coffee Day",
  "narration": "Lunch — Sodexo",
  "postings": [
    { "account": "Expenses:Food:Restaurants", "amount": 400.00, "currency": "INR" },
    { "account": "Assets:Prepaid:Sodexo:Meal", "amount": -400.00, "currency": "INR" }
  ]
}
```

## Forex cards (prepaid, foreign currency)

Same `Assets:Prepaid` segment — the currency on the posting tells you
it's forex. Loading is a conversion (₹ → foreign), so use `@@` for the
rate. Spending abroad is single-currency in the foreign unit.

### Load
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Forex load",
  "narration": "Loaded forex card — 1000 USD @ ₹84.50",
  "postings": [
    { "account": "Assets:Prepaid:HDFC:Forex:Multi", "amount": 1000.00, "currency": "USD", "price_at_signs": 2, "price_amount": 84500.00, "price_currency": "INR" },
    { "account": "Assets:Bank:HDFC:Savings", "amount": -84500.00, "currency": "INR" }
  ]
}
```

### Spend abroad (already in USD — no FX at point of sale)
```json
{
  "kind": "transaction",
  "date": "2026-05-30",
  "flag": "*",
  "payee": "Whole Foods",
  "narration": "Groceries — NYC",
  "postings": [
    { "account": "Expenses:Travel:Food", "amount": 50.00, "currency": "USD" },
    { "account": "Assets:Prepaid:HDFC:Forex:Multi", "amount": -50.00, "currency": "USD" }
  ]
}
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
```json
{
  "kind": "transaction",
  "date": "2026-05-30",
  "flag": "*",
  "payee": "Joe's Pizza",
  "narration": "Dinner — NYC ($50 + ₹148 markup + ₹26.64 GST)",
  "postings": [
    { "account": "Expenses:Travel:Food", "amount": 50.00, "currency": "USD", "price_at_signs": 2, "price_amount": 4225.00, "price_currency": "INR" },
    { "account": "Expenses:Financial:ForexMarkup", "amount": 148.00, "currency": "INR" },
    { "account": "Expenses:Financial:GST", "amount": 26.64, "currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": -4399.64, "currency": "INR" }
  ]
}
```

### Short form (markup baked into a single INR total)
Use this only when the user can't see the markup split out, or
explicitly wants a single line. The `@@` rate ends up implicitly
including the markup.
```json
{
  "kind": "transaction",
  "date": "2026-05-30",
  "flag": "*",
  "payee": "Joe's Pizza",
  "narration": "Dinner — NYC",
  "postings": [
    { "account": "Expenses:Travel:Food", "amount": 50.00, "currency": "USD", "price_at_signs": 2, "price_amount": 4373.00, "price_currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": -4373.00, "currency": "INR" }
  ]
}
```

### When the statement itemizes the markup / GST on separate rows (fold them in)
Indian statements usually print the merchant charge, the **"FOREIGN
CURRENCY TRANSACTION FEE"** (or **"DCC MARKUP"**), and the **"GST"** as
three separate rows — often dated a day or two apart, sometimes
interleaved with other transactions. They are NOT three transactions.
They are ONE: fold the fee and GST back into the merchant's transaction.

- The row carries **two different numbers**: the foreign amount in the
  `( CCY x.xx )` bracket by the merchant, and the billed amount (in the
  card's billing currency) as the row's main figure. The foreign amount is
  the posting's quantity; the billed amount is the `@@` total. They are
  never equal — currencies don't convert 1:1, so never reuse the billed
  figure as the foreign quantity. In the example below the bracket says
  `USD 9.28` and the billed figure is `875.30` — the posting is
  `9.28 USD @@ 875.30 INR`, NOT `875.30 USD @@ 875.30 INR`.
- The `@@` weight is the merchant's billed amount **exactly as shown on
  that row** — do NOT re-derive, round, or "back out" the fee from it.
  Re-deriving the rate is a common mistake; the billed figure is printed,
  use it verbatim.
- The markup fee and its GST are their own plain INR legs
  (`Expenses:Financial:ForexMarkup`, `Expenses:Financial:GST`).
- The card liability is the **sum of all three**: billed INR + markup +
  GST. The transaction balances on that sum, not on the billed amount
  alone.

To pair a stray fee/GST row with the charge it belongs to: the markup is
the card's forex rate (commonly **2%**) of the billed INR, and the GST is
**18% of that markup**. Match by that arithmetic. E.g. an ₹875.30 charge
→ ₹17.51 markup (2% of 875.30) → ₹3.15 GST (18% of 17.51), so the card is
debited 875.30 + 17.51 + 3.15 = 895.96:
```json
{
  "kind": "transaction",
  "date": "2026-04-26",
  "flag": "*",
  "payee": "Cloudflare",
  "narration": "Hosting (USD 9.28 + ₹17.51 markup + ₹3.15 GST)",
  "postings": [
    { "account": "Expenses:Personal:Software", "amount": 9.28, "currency": "USD", "price_at_signs": 2, "price_amount": 875.30, "price_currency": "INR" },
    { "account": "Expenses:Financial:ForexMarkup", "amount": 17.51, "currency": "INR" },
    { "account": "Expenses:Financial:GST", "amount": 3.15, "currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": -895.96, "currency": "INR" }
  ]
}
```
A "DCC MARKUP" row works identically — same fold, same `Expenses:Financial:ForexMarkup`
leg — even when the merchant charge is billed straight in INR (no USD
shown), in which case the expense leg is plain INR with no `@@`.

**Interleaved fees — pair by arithmetic, never by adjacency.** When two
foreign charges land close together the bank prints all their fees and
GSTs mixed up and out of order (a GST can come before its own markup). Pair
each one by the chain — markup is 2% of ITS charge, GST is 18% of THAT
markup — not by which row is nearest. E.g. an ₹1,893.43 charge and a
₹5,825.78 charge produce four rows printed `GST 20.97 / FEE 116.52 /
GST 6.82 / FEE 37.87`:
- ₹1,893.43 → markup 37.87 (2%) → GST 6.82 (18% of 37.87) → card 1,938.12
- ₹5,825.78 → markup 116.52 (2%) → GST 20.97 (18% of 116.52) → card 5,963.27

The GST printed nearest a charge is often the *other* charge's GST — the
only reliable link is "GST ≈ 18% of the markup that is 2% of this charge."

## Gift cards / vouchers

A gift card is an asset — value you hold until you spend it.

### Bought with cash or card
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Amazon",
  "narration": "Bought ₹1000 Amazon gift card",
  "postings": [
    { "account": "Assets:GiftCards:Amazon", "amount": 1000.00, "currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": -1000.00, "currency": "INR" }
  ]
}
```

### Received as a gift (income)
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Friend",
  "narration": "Birthday — Amazon gift card",
  "postings": [
    { "account": "Assets:GiftCards:Amazon", "amount": 1000.00, "currency": "INR" },
    { "account": "Income:Gifts", "amount": -1000.00, "currency": "INR" }
  ]
}
```

### Redeemed at checkout
Full:
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Amazon",
  "narration": "Book — paid with gift card",
  "postings": [
    { "account": "Expenses:Shopping:Books", "amount": 500.00, "currency": "INR" },
    { "account": "Assets:GiftCards:Amazon", "amount": -500.00, "currency": "INR" }
  ]
}
```

Partial (gift card + card):
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Amazon",
  "narration": "Book — ₹500 gift card + ₹300 on card",
  "postings": [
    { "account": "Expenses:Shopping:Books", "amount": 800.00, "currency": "INR" },
    { "account": "Assets:GiftCards:Amazon", "amount": -500.00, "currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": -300.00, "currency": "INR" }
  ]
}
```

## Settling with people

Use `Assets:Receivable:<Person>` for what they owe you,
`Liabilities:Payable:<Person>` for what you owe them. Payables follow
the same sign convention as credit cards (negative = you owe).

### You paid the whole bill; friend owes their share
Card got charged the full amount; half is your expense, half is owed to
you and sits in `Receivable` until they pay.
```json
{
  "kind": "transaction",
  "date": "2026-05-26",
  "flag": "*",
  "payee": "BBQ Nation",
  "narration": "Dinner — split 50/50 with Rohan",
  "postings": [
    { "account": "Expenses:Food:Restaurants", "amount": 1500.00, "currency": "INR" },
    { "account": "Assets:Receivable:Rohan", "amount": 1500.00, "currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": -3000.00, "currency": "INR" }
  ]
}
```

### Friend pays you back
Clears the receivable to zero.
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Rohan",
  "narration": "UPI — dinner share",
  "postings": [
    { "account": "Assets:Bank:HDFC:Savings", "amount": 1500.00, "currency": "INR" },
    { "account": "Assets:Receivable:Rohan", "amount": -1500.00, "currency": "INR" }
  ]
}
```

### Friend paid for both; you owe them
You consumed the expense, but no card / cash of yours moved — the credit
side is a `Payable`.
```json
{
  "kind": "transaction",
  "date": "2026-05-26",
  "flag": "*",
  "payee": "Sneha",
  "narration": "Movie tickets she booked for both of us",
  "postings": [
    { "account": "Expenses:Entertainment:Movies", "amount": 750.00, "currency": "INR" },
    { "account": "Liabilities:Payable:Sneha", "amount": -750.00, "currency": "INR" }
  ]
}
```

### You pay friend back
Cash leaves your bank; the payable posting is positive (reducing the
liability back to zero).
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Sneha",
  "narration": "UPI — movie tickets",
  "postings": [
    { "account": "Liabilities:Payable:Sneha", "amount": 750.00, "currency": "INR" },
    { "account": "Assets:Bank:HDFC:Savings", "amount": -750.00, "currency": "INR" }
  ]
}
```

## Reimbursements (work expenses you'll claim back)

### Out of pocket now, claim later
Record the receivable up front so the spend doesn't dilute personal P&L.
Same shape as splitting a bill — company in place of friend.
```json
{
  "kind": "transaction",
  "date": "2026-05-26",
  "flag": "*",
  "payee": "Uber",
  "narration": "Client meeting — claim from ACME",
  "postings": [
    { "account": "Assets:Receivable:ACME", "amount": 500.00, "currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": -500.00, "currency": "INR" }
  ]
}
```

### Reimbursement lands
Same shape as a friend paying you back.
```json
{
  "kind": "transaction",
  "date": "2026-06-15",
  "flag": "*",
  "payee": "ACME",
  "narration": "May reimbursement payout",
  "postings": [
    { "account": "Assets:Bank:HDFC:Savings", "amount": 500.00, "currency": "INR" },
    { "account": "Assets:Receivable:ACME", "amount": -500.00, "currency": "INR" }
  ]
}
```

## Refunds (reverse an earlier purchase)

Exact mirror of the original purchase — sign-flipped on both legs. If the
refund hits a different card / bank than the original, swap the second
leg accordingly.
```json
{
  "kind": "transaction",
  "date": "2026-05-26",
  "flag": "*",
  "payee": "Amazon",
  "narration": "Refund — returned earphones",
  "postings": [
    { "account": "Expenses:Shopping:Electronics", "amount": -3500.00, "currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": 3500.00, "currency": "INR" }
  ]
}
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
the two numbers. `<SrcAcct>` / `SRC_PTS` is the programme account you
transfer from, `<DestAcct>` / `DST_PTS` the one you transfer to. Replace
both with the real programme accounts and KG tickers (e.g.
`Assets:Rewards:Axis`/`AXIS-RP` →
`Assets:Rewards:Points:Marriott`/`MARRIOTTBONVOY`); never emit
`SRC_PTS`/`DST_PTS` literally in output.

### Instant landing (points show up in the destination right away)
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Transfer",
  "narration": "10000 source pts → 13000 dest (30% bonus)",
  "postings": [
    { "account": "<DestAcct>", "amount": 13000, "currency": "DST_PTS", "price_at_signs": 2, "price_amount": 10000, "price_currency": "SRC_PTS" },
    { "account": "<SrcAcct>", "amount": -10000, "currency": "SRC_PTS" }
  ]
}
```

### Pending (transfer initiated but points haven't landed yet)
Until the destination programme posts the points, they sit in the
destination's `:Pending` child.
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Transfer",
  "narration": "10000 source pts → 13000 dest (pending)",
  "postings": [
    { "account": "<DestAcct>:Pending", "amount": 13000, "currency": "DST_PTS", "price_at_signs": 2, "price_amount": 10000, "price_currency": "SRC_PTS" },
    { "account": "<SrcAcct>", "amount": -10000, "currency": "SRC_PTS" }
  ]
}
```

When the points land, settle the receivable:
```json
{
  "kind": "transaction",
  "date": "2026-05-30",
  "flag": "*",
  "payee": "Transfer credited",
  "narration": "Dest program posted the points",
  "postings": [
    { "account": "<DestAcct>", "amount": 13000, "currency": "DST_PTS" },
    { "account": "<DestAcct>:Pending", "amount": -13000, "currency": "DST_PTS" }
  ]
}
```

## Redemptions — always associate a cash value

**The #1 mistake — never denominate the expense in points.** A flight/hotel/
purchase is priced in CASH; the points are the payment, recorded on the rewards
leg via `@@`.

❌ WRONG (points on the expense leg — a flight is not priced in miles):
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Airline",
  "narration": "Award flight",
  "postings": [
    { "account": "Expenses:Travel:Flights", "amount": 20000, "currency": "RWD_PTS" },
    { "account": "<RewardsAcct>", "amount": -20000, "currency": "RWD_PTS" }
  ]
}
```
✅ RIGHT (expense is the CASH fare; the points leg carries that value via `@@`):
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Airline",
  "narration": "Award flight",
  "postings": [
    { "account": "Expenses:Travel:Flights", "amount": 50000.00, "currency": "INR" },
    { "account": "<RewardsAcct>", "amount": -20000, "currency": "RWD_PTS", "price_at_signs": 2, "price_amount": 50000.00, "price_currency": "INR" }
  ]
}
```

**If the source shows ONLY the points** (a bare loyalty statement: just a
negative points line against a flight, no cash fare), you do NOT have the value.
`clarify` and ask the user for each redemption's cash fare BEFORE drafting it —
never fall back to ❌ and price the flight in points.

**Hard rule:** every redemption associates a cash value with the points
side via `@@`. There are no exceptions — statement credits, pay-at-
merchant, award flights, award hotels, hybrid fares, all the same shape.
The points leg's weight is the cash equivalent at redemption time
(statement credit amount, cash fare displaced, hotel cash rate, etc.).

### Cashback applied to the statement (same currency)
Settles the receivable from the Cashback pattern. Card liability goes
down, receivable goes back to zero. (Same-currency, so no `@@` needed —
the value is already in INR.)
```json
{
  "kind": "transaction",
  "date": "2026-05-31",
  "flag": "*",
  "payee": "Statement credit",
  "narration": "Cashback credited to May statement",
  "postings": [
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": 3.70, "currency": "INR" },
    { "account": "Assets:Receivable:<Issuer>", "amount": -3.70, "currency": "INR" }
  ]
}
```

### Points redeemed for statement credit
The statement-credit amount IS the cash value.
```json
{
  "kind": "transaction",
  "date": "2026-05-31",
  "flag": "*",
  "payee": "Statement credit",
  "narration": "Redeem 1000 pts → ₹250 statement credit",
  "postings": [
    { "account": "<RewardsAcct>", "amount": -1000, "currency": "RWD_PTS", "price_at_signs": 2, "price_amount": 250.00, "price_currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": 250.00, "currency": "INR" }
  ]
}
```

### Pay with points at a merchant
Merchant's quoted price IS the cash value. Same shape for partial
redemptions (points + card).
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Amazon",
  "narration": "Headphones — paid 2500 pts",
  "postings": [
    { "account": "Expenses:Shopping:Electronics", "amount": 500.00, "currency": "INR" },
    { "account": "<RewardsAcct>", "amount": -2500, "currency": "RWD_PTS", "price_at_signs": 2, "price_amount": 500.00, "price_currency": "INR" }
  ]
}
```
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Amazon",
  "narration": "Headphones — 2500 pts + ₹500 on card",
  "postings": [
    { "account": "Expenses:Shopping:Electronics", "amount": 1000.00, "currency": "INR" },
    { "account": "<RewardsAcct>", "amount": -2500, "currency": "RWD_PTS", "price_at_signs": 2, "price_amount": 500.00, "price_currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": -500.00, "currency": "INR" }
  ]
}
```

### Award flight (miles + taxes/fees)
The cash-equivalent fare is the value the miles unlocked. Expense is the
full fare (what the trip "cost" you in honest terms); miles cover the
fare minus the cash co-pay; card / bank pays the co-pay (taxes, fees).

Example: 75k miles + ₹5k taxes for a DEL-SFO ticket whose cash fare
is ₹100k → miles' cash value is ₹95k (100k − 5k).
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Airline",
  "narration": "Award DEL-SFO — 75k miles + ₹5k taxes (₹100k cash fare)",
  "postings": [
    { "account": "Expenses:Travel:Flights", "amount": 100000.00, "currency": "INR" },
    { "account": "<RewardsAcct>", "amount": -75000, "currency": "RWD_PTS", "price_at_signs": 2, "price_amount": 95000.00, "price_currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": -5000.00, "currency": "INR" }
  ]
}
```

### Award hotel night
Same shape — cash-equivalent room rate is the value the points unlocked.
Resort fee / taxes hit the card.
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Hotel",
  "narration": "Award night — 40k pts + ₹500 resort fee (₹15k cash rate)",
  "postings": [
    { "account": "Expenses:Travel:Hotels", "amount": 15000.00, "currency": "INR" },
    { "account": "<RewardsAcct>", "amount": -40000, "currency": "RWD_PTS", "price_at_signs": 2, "price_amount": 14500.00, "price_currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": -500.00, "currency": "INR" }
  ]
}
```

### Hybrid cash + points fare (Pay-with-Miles / cash-and-points)
Cash + points together cover the full fare. Each side's contribution is
what it actually paid. Below, ₹6k cash fare, 15k points cover ₹5.5k,
₹500 convenience fee on card.
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Airline",
  "narration": "DEL-BLR — 15k pts + ₹500 fee (₹6k cash fare)",
  "postings": [
    { "account": "Expenses:Travel:Flights", "amount": 6000.00, "currency": "INR" },
    { "account": "<RewardsAcct>", "amount": -15000, "currency": "RWD_PTS", "price_at_signs": 2, "price_amount": 5500.00, "price_currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": -500.00, "currency": "INR" }
  ]
}
```

## Bonuses, expiry, and other point-balance adjustments

Earn / write-off events without a conversion rate. Single-currency,
contra is `Equity:Void`. Same two-step lifecycle as the Points pattern:
the **announcement / qualifying event** hits `<RewardsAcct>:Pending`; the
**posting** moves it to the parent. Welcome bonuses, anniversary
bonuses, referral bonuses, milestone bonuses all follow this — they're
promised on a date, posted later. Expiry sweeps and clawbacks hit
`<RewardsAcct>` directly (they're removing posted balance), not
pending.

```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Welcome bonus",
  "narration": "100k welcome bonus — qualifying spend hit",
  "postings": [
    { "account": "<RewardsAcct>:Pending", "amount": 100000, "currency": "RWD_PTS" },
    { "account": "Equity:Void", "amount": -100000, "currency": "RWD_PTS" }
  ]
}
```
When it posts to the balance:
```json
{
  "kind": "transaction",
  "date": "2026-06-15",
  "flag": "*",
  "payee": "Welcome bonus posted",
  "narration": "100k welcome bonus credited",
  "postings": [
    { "account": "<RewardsAcct>", "amount": 100000, "currency": "RWD_PTS" },
    { "account": "<RewardsAcct>:Pending", "amount": -100000, "currency": "RWD_PTS" }
  ]
}
```
Expiry sweep (removes already-posted balance — no pending involved):
```json
{
  "kind": "transaction",
  "date": "2026-12-31",
  "flag": "*",
  "payee": "Points expiry",
  "narration": "Expired 2024 vintage points",
  "postings": [
    { "account": "<RewardsAcct>", "amount": -3500, "currency": "RWD_PTS" },
    { "account": "Equity:Void", "amount": 3500, "currency": "RWD_PTS" }
  ]
}
```

## Referrals (you referred someone; reward landed for you)

Shape depends on what the reward actually is. If it's **cash** (lands in
a bank, a wallet, or as a statement credit), the credit side is
`Income:Referrals` because realized cash value is changing hands. If
it's **points / miles**, it's the same two-step lifecycle as the
Points pattern — accrue to `<RewardsAcct>:Pending` with
`Equity:Void` contra, then a separate landing entry moves the balance
to `<RewardsAcct>`.

### Cash referral credited to bank
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Niyo",
  "narration": "Referral bonus — Aman signed up",
  "postings": [
    { "account": "Assets:Bank:HDFC:Savings", "amount": 500.00, "currency": "INR" },
    { "account": "Income:Referrals", "amount": -500.00, "currency": "INR" }
  ]
}
```

### Cash referral as a statement credit on the card
Card liability goes down; income captures the realized value.
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Referral credit",
  "narration": "Referral statement credit — Aman signed up",
  "postings": [
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": 1000.00, "currency": "INR" },
    { "account": "Income:Referrals", "amount": -1000.00, "currency": "INR" }
  ]
}
```

### Pending cash referral (friend hasn't completed signup yet)
Sit it in a receivable until the issuer actually pays out.
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Referral promised",
  "narration": "Aman card under review",
  "postings": [
    { "account": "Assets:Receivable:<Issuer>", "amount": 1000.00, "currency": "INR" },
    { "account": "Income:Referrals", "amount": -1000.00, "currency": "INR" }
  ]
}
```
When it lands, settle the receivable against the bank / card just like
any other receivable payout.

### Points referral (announced)
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Referral bonus",
  "narration": "15000 pts for referring Aman",
  "postings": [
    { "account": "<RewardsAcct>:Pending", "amount": 15000, "currency": "RWD_PTS" },
    { "account": "Equity:Void", "amount": -15000, "currency": "RWD_PTS" }
  ]
}
```
When the points post to your balance:
```json
{
  "kind": "transaction",
  "date": "2026-06-15",
  "flag": "*",
  "payee": "Referral bonus posted",
  "narration": "15000 pts credited",
  "postings": [
    { "account": "<RewardsAcct>", "amount": 15000, "currency": "RWD_PTS" },
    { "account": "<RewardsAcct>:Pending", "amount": -15000, "currency": "RWD_PTS" }
  ]
}
```

## Buying points with cash

Conversion at a defined rate → `@@` on the points leg. Same shape for
program points and airline miles alike. No expense — you've shifted INR
into a different asset (points).

```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Buy points",
  "narration": "Bought 10000 pts for ₹3000",
  "postings": [
    { "account": "<RewardsAcct>", "amount": 10000, "currency": "RWD_PTS", "price_at_signs": 2, "price_amount": 3000.00, "price_currency": "INR" },
    { "account": "Assets:Bank:HDFC:Savings", "amount": -3000.00, "currency": "INR" }
  ]
}
```
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Buy points",
  "narration": "Bought 10000 pts for ₹3000 on card",
  "postings": [
    { "account": "<RewardsAcct>", "amount": 10000, "currency": "RWD_PTS", "price_at_signs": 2, "price_amount": 3000.00, "price_currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": -3000.00, "currency": "INR" }
  ]
}
```

## Redemption refunds (mirror of the original)

Sign-flipped copy of the original redemption — every redemption was
`@@`, so every refund is `@@` too. Use the same cash value the
redemption was booked at.

### Award flight cancelled (miles + taxes come back)
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Airline",
  "narration": "Cancelled DEL-SFO — miles + taxes refunded",
  "postings": [
    { "account": "Expenses:Travel:Flights", "amount": -100000.00, "currency": "INR" },
    { "account": "<RewardsAcct>", "amount": 75000, "currency": "RWD_PTS", "price_at_signs": 2, "price_amount": 95000.00, "price_currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": 5000.00, "currency": "INR" }
  ]
}
```

### Statement-credit redemption reversed
```json
{
  "kind": "transaction",
  "date": "2026-05-27",
  "flag": "*",
  "payee": "Statement credit",
  "narration": "Statement-credit redemption reversed",
  "postings": [
    { "account": "<RewardsAcct>", "amount": 1000, "currency": "RWD_PTS", "price_at_signs": 2, "price_amount": 250.00, "price_currency": "INR" },
    { "account": "Liabilities:CreditCards:<Issuer>:<Card>", "amount": -250.00, "currency": "INR" }
  ]
}
```

## When to use `@@` vs `Equity:Void` on the point side

- **Any redemption or conversion** — points are being exchanged for
  cash, for a flight, for a hotel night, or for another point currency:
  use `@@` on the point posting with the cash-equivalent value at
  redemption. (Examples: transferring points between programs,
  redeeming points for a statement credit, paying with points at a
  merchant, buying points with cash, award flights, award hotel nights,
  hybrid cash-and-points fares.)
- **Accrual / write-off** — point balance changes without a conversion
  rate: use `Equity:Void` as the point-side contra. (Examples: earning
  points on a purchase → hits `<RewardsAcct>:Pending`; welcome bonuses,
  anniversary bonuses, referral bonuses, milestone bonuses → also
  `:Pending`; expiry sweeps and clawbacks → `<RewardsAcct>`.)
- **Landing** — issuer posts already-accrued points from pending
  into your balance: no `Equity:Void`, no `@@` — just `:Pending` down,
  `<RewardsAcct>` up in the same currency. It's a transfer between
  two of your own accounts.

## Balance assertions

A balance is asserted as a `pad` + `balance` pair (IR `kind:"pad"`) — the pad
fills the gap so the balance holds. The plug is **always `Equity:Void`**, every
account type; code sets it (you don't choose). The pair is the unit; a `pad`
without a following `balance` for the same account is dropped. (Use a bare
`kind:"balance"` when the running balance already equals the figure exactly.)

```json
{ "kind": "pad", "date": "2026-06-01", "account": "Assets:Bank:HDFC:Savings", "amount": 123456.78, "currency": "INR" }
```
