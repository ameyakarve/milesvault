# Understanding your MilesVault ledger

A 10-minute primer. **You never have to write any of this** — MilesVault drafts
every entry from your statements and you just review and approve. This is here so
that when you read a draft, it makes sense.

All names and numbers below are made up for illustration.

---

## The big idea: plain-text, double-entry

Your finances live as a **plain-text file** (the [Beancount](https://beancount.github.io)
format). It's human-readable, exportable, and yours — nothing locked in a
proprietary app.

It's **double-entry**, which sounds fancy but is one simple rule:

> **Money always moves _from_ one place _to_ another. Every entry adds up to zero.**

If you spent ₹500 on coffee with your HDFC card, ₹500 *left* "available credit"
and ₹500 *arrived* as a food expense. Two sides, equal and opposite.

---

## The shape of an entry

```beancount
2026-05-27 * "Blue Tokai" "Morning coffee"
  Expenses:Food:Coffee                        500.00 INR
  Liabilities:CreditCards:HDFC:Infinia       -500.00 INR
```

- **Date**, then `*` (a confirmed transaction), then the **payee** and a short **note**.
- Two **postings** below. They sum to **zero**: `500 + (−500) = 0`.
- The card line is **negative** — more on that next.

---

## The five kinds of accounts

Every account starts with one of five words:

| Root | What it means | Examples |
|---|---|---|
| **Assets** | what you *have* | bank balance, wallet money, gift cards, reward points & miles, status progress |
| **Liabilities** | what you *owe* | credit cards, loans |
| **Income** | money coming *in* | salary, interest, a gift |
| **Expenses** | money going *out*, by category | food, travel, shopping, fees |
| **Equity** | the balancing bucket | opening balances, adjustments |

### One sign rule to remember
A credit card is a **liability**, and what you owe shows as a **negative** number.
So a purchase makes it *more* negative (you owe more), and a payment makes it
*less* negative (you owe less). That's the only "gotcha" — everything else reads
naturally.

---

## How MilesVault organises your accounts

You'll see accounts nested with colons, going from general to specific:

```
Assets:Bank:HDFC:Savings                     your bank account
Assets:Prepaid:Wallets:Paytm                 a loaded wallet
Assets:Prepaid:GiftCards:Amazon              a gift card
Assets:Rewards:HDFC                          a card's reward-point pool
Assets:Rewards:Miles:KrisFlyer               airline miles
Assets:Rewards:Points:Marriott               hotel / programme points
Assets:Rewards:Status:Marriott               progress toward elite status
Liabilities:CreditCards:HDFC:Infinia         a credit card
Expenses:Food:Restaurants                    a spending category
Expenses:Financial:Fees:Forex                a fee category
Income:Salary                                money coming in
```

Spending is grouped under **ten categories**: Housing, Food, Transport, Health,
Shopping, Entertainment, Personal, Financial (fees/interest/taxes), Travel, and
Misc — each with finer sub-categories underneath.

---

## Examples you'll actually see

### 1. A card purchase (and the points it earns)
One swipe captures both the spend **and** the reward it earned:

```beancount
2026-05-27 * "Amazon" "Headphones"
  Expenses:Shopping:Electronics               3000.00 INR
  Liabilities:CreditCards:HDFC:Infinia       -3000.00 INR
  Assets:Rewards:HDFC:Pending                  100.00 HDFC-RP
  Equity:Void                                 -100.00 HDFC-RP
```

The first two lines are the purchase. The last two are the **points you earned**
(100 reward points, here). `Equity:Void` is just a bookkeeping counterweight so the
points line balances — you can ignore it.

> **Points are their own "currency."** They're counted in `HDFC-RP` (reward
> points), not rupees — so they never get mixed up with money.

### 2. A foreign-currency swipe (forex)
Spend abroad and the charge is in the **foreign currency**. Record the real foreign
amount with `@@` (the total it converted to in INR), and itemise the bank's markup
and the GST on it as their own lines — never pre-convert the expense to rupees:

```beancount
2026-05-29 * "Tokyo Hotel" "2 nights — ¥30,000 (+₹577.50 markup +₹103.95 GST)"
  Expenses:Travel:Lodging          30000 JPY @@ 16500.00 INR  ; ¥30,000 → ₹16,500
  Expenses:Financial:ForexMarkup               577.50 INR     ; the bank's 3.5% markup
  Expenses:Financial:GST                       103.95 INR     ; 18% GST on the markup
  Liabilities:CreditCards:HDFC:Infinia      -17181.45 INR     ; total added to the card
```

The `@@` keeps the true ¥30,000 face value while giving the line a rupee weight of
₹16,500 for the balance check (16,500 + 577.50 + 103.95 = 17,181.45 on the card).

### 3. Paying your card bill
A payment *reduces* what you owe, so the card line is **positive**:

```beancount
2026-05-30 * "Payment received" "Auto-debit"
  Liabilities:CreditCards:HDFC:Infinia       25000.00 INR
  Assets:Clearing:CardPayments              -25000.00 INR
```

### 4. A refund
A refund mirrors the purchase — the expense goes negative, the card positive:

```beancount
2026-06-02 * "Amazon" "Returned headphones"
  Expenses:Shopping:Electronics              -3000.00 INR
  Liabilities:CreditCards:HDFC:Infinia        3000.00 INR
```

### 5. Cashback
Cashback is credited separately, so the full price still shows as your expense:

```beancount
2026-06-03 * "Swiggy" "Dinner — ₹20 cashback"
  Expenses:Food:Restaurants                    400.00 INR
  Liabilities:CreditCards:HSBC:LivePlus       -400.00 INR
  Assets:Receivable:HSBC                        20.00 INR
  Equity:Void                                  -20.00 INR
```

### 6. Points & miles: a two-step life
Points are usually **earned now but credited later**. Earned points wait in a
`:Pending` account; once the statement posts them, they move to the main balance:

```beancount
; earned on a purchase — not usable yet
2026-05-27 * "Air India" "Flight booking"
  Expenses:Travel:Flights                     8000.00 INR
  Liabilities:CreditCards:Axis:Magnus        -8000.00 INR
  Assets:Rewards:Axis:Pending                  480.00 AXIS-EDGE
  Equity:Void                                 -480.00 AXIS-EDGE

; later, the bank actually credits them
2026-06-16 * "Statement close" "Posted points"
  Assets:Rewards:Axis                          480.00 AXIS-EDGE
  Assets:Rewards:Axis:Pending                 -480.00 AXIS-EDGE
```

### 7. Transferring points between programmes
Move card points into an airline or hotel programme and they change "currency" at a
ratio. The `@` price is just the conversion rate that lets the two sides balance —
here 2,000 card points become 1,000 miles at 2:1:

```beancount
2026-06-10 * "Transfer" "HDFC points → KrisFlyer miles, 2:1"
  Assets:Rewards:HDFC              -2000 HDFC-RP @ 0.5 KRISFLYER
  Assets:Rewards:Miles:KrisFlyer    1000 KRISFLYER
```

### 8. Redeeming points or miles
When you spend miles on an award flight, the miles leave your balance and pay for
the trip (priced at what the cash fare would have been):

```beancount
2026-06-20 * "Singapore Airlines" "Award flight"
  Expenses:Travel:Flights                    15000.00 INR
  Assets:Rewards:Miles:KrisFlyer             -7125 KRISFLYER @@ 15000.00 INR
```

### 9. Progress toward elite status
Some spend earns points *and* counts toward status. A qualifying hotel stay racks up
points and **status nights** — the nights are tracked as their own counter, which is
what the vault home shows as your progress to the next tier:

```beancount
2026-05-31 * "Marriott" "2-night stay — qualifying"
  Expenses:Travel:Lodging                    18000.00 INR
  Liabilities:CreditCards:HDFC:Infinia      -18000.00 INR
  Assets:Rewards:Points:Marriott              9000 MARRIOTT
  Equity:Void                                -9000 MARRIOTT
  Assets:Rewards:Status:Marriott                 2 MARRIOTT-NIGHT
  Equity:Void                                   -2 MARRIOTT-NIGHT
```

### 10. Wallets & gift cards
Money you've loaded sits as an asset until you spend it down:

```beancount
; load a wallet from the bank
2026-05-27 * "Paytm" "Wallet top-up"
  Assets:Prepaid:Wallets:Paytm                1000.00 INR
  Assets:Bank:HDFC:Savings                   -1000.00 INR

; spend a gift card at checkout
2026-05-28 * "Amazon" "Book — paid with gift card"
  Expenses:Shopping:Books                      500.00 INR
  Assets:Prepaid:GiftCards:Amazon             -500.00 INR
```

### 11. Opening balances & safety-net checks: `balance` and `pad`
Two special, non-transaction lines keep your ledger honest.

A **`balance`** line is a *checkpoint* — it asserts what an account **should** hold
on a date, taken straight off your statement. If the ledger has drifted even by a
rupee, MilesVault flags it:

```beancount
2026-06-15 balance Liabilities:CreditCards:HDFC:Infinia   -12638.52 INR
```

But what if you're *starting* a card mid-life and don't want to enter years of
history? That's what **`pad`** is for. Placed just before a `balance`, it tells the
ledger: *"insert whatever single adjustment is needed here — booked against
`Equity:Opening-Balances` — to make the next assertion true."*

```beancount
2026-01-01 pad     Liabilities:CreditCards:HDFC:Infinia   Equity:Opening-Balances
2026-01-01 balance Liabilities:CreditCards:HDFC:Infinia   -12638.52 INR
```

The `pad` fills the gap automatically, so the balance holds without itemising the
past. You'll see **pad + balance pairs** whenever an account is first opened, or
whenever a statement hands MilesVault an authoritative closing balance to reconcile
against — for money *and* for points.

---

## Reading a draft in MilesVault — the cheat sheet

- **You review, you don't write.** MilesVault reads your statement and drafts the
  entries; you approve, tweak, or reject each one.
- **Every transaction balances to zero** (per currency) — that's the integrity check.
- **Negative on a credit card = what you owe.**
- **`:Pending`** = points earned but not yet credited by the bank.
- **Points/miles/status** are counted in their own units (a ticker like `AXIS-EDGE`
  or `MARRIOTT-NIGHT`), never rupees.
- **An `@` price** on a rewards line is just a conversion rate — for a transfer
  between programmes, or to value a redemption against its cash fare.
- **`balance`** asserts what an account should hold; **`pad`** (just before it) lets
  the ledger set an opening balance or reconcile to a statement automatically.
- **`Equity:Void`** is a harmless bookkeeping counterweight for rewards — safe to ignore.

That's everything you need to read your ledger with confidence. Welcome to the beta 🙌
