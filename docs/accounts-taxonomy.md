# Accounts — Kinds & Path Prefixes

Accounts carry a `kind` derived from the first two path segments. The derivation is a pure function from path → kind. Path is beancount-native; kind is MilesVault's typing layer for analytics, UI, and validation.

## Top-level tree

Five fixed roots (beancount mandate). MilesVault is opinionated about the second level — these are the only paths the app expects to see. New users start with this tree; deeper segments are user-chosen and free-form.

```
Assets
  Bank:<institution>:<account>          e.g. Assets:Bank:HDFC:Savings
  Cash                                  physical cash (one or more sub-accounts ok)
  Investments:<broker>:<vehicle>        e.g. Assets:Investments:Zerodha:Stocks
  Retirement:<scheme>                   e.g. Assets:Retirement:EPF, Assets:Retirement:NPS
  Receivable:<name>                     IOUs owed to you
  Prepaid:<vendor>                      rent paid forward, deposits, etc.
  DebitCards:*                          see "Cards" section
  Loaded:Wallets|PrepaidCards|GiftCards|ForexCards:*   see "Cards" section
  Rewards:Points|Status:*               see "Rewards" section

Liabilities
  CreditCards:<issuer>:<product>        e.g. Liabilities:CreditCards:HDFC:Infinia
  Loan:Mortgage|Auto|Student|Personal:<lender>
  Payable:<name>                        IOUs you owe

Equity
  Opening-Balances                      one entry per account at user onboarding
  Void                                  reserved; do not post to (see plugs below)

Income
  Salary:<employer>
  Bonus:<employer>
  Interest:<source>                     bank, FD, bond
  Dividend:<source>                     stocks, MFs
  Gift                                  inbound gifts of cash; non-cash gifts route via Income:Void + #gift-in
  Void                                  plug — see "System plug accounts"

Expenses
  Housing                               rent, mortgage interest, utilities, repairs
  Food                                  groceries, restaurants, coffee, delivery
  Transport                             fuel, public transit, ride-share, parking, vehicle service
  Health                                doctor, pharmacy, insurance premiums, gym
  Shopping                              clothing, electronics, household goods
  Entertainment                         streaming, events, dining-out (overlap w/ Food is user choice)
  Personal                              grooming, education, subscriptions, hobbies
  Financial                             fees, interest paid, taxes, FX markup
  Travel                                flights, hotels, museums, local transport while abroad
  Misc                                  small bucket; if a row recurs, give it a real category
  Void                                  plug — see "System plug accounts"
```

### Rules of thumb

- **Two-level Expense max in v1.** `Expenses:Food:Coffee` is fine; `Expenses:Food:Restaurant:Italian:Pasta` is not. Drill into payee/narration if you want finer slicing.
- **Payee in narration, not in path.** Don't create `Expenses:Food:BlueTokai` — log "Blue Tokai" as the payee on the txn.
- **Institution as the middle segment for Assets/Liabilities.** `Assets:Bank:HDFC:Savings`, `Liabilities:CreditCards:Amex:Plat` — keeps per-institution rollups cheap.
- **Cashback and refunds are NOT income.** They reduce the originating expense:
  - Cashback: `#cashback` tag, full outflow + credit-back to the instrument, `Income:Void` plug. See "Cashback and discounts" below.
  - Refunds: same shape as cashback when traceable to the original txn; otherwise model as a negative posting on the original `Expenses:*` category.
  - Untraceable rebates (rare): `Expenses:Misc:Rewards` is acceptable; don't invent `Income:Cashback`.
- **`Misc` stays small.** If a row repeats more than 2–3 months, promote it to a real second-level category.
- **No `Equity:Earnings` rollup.** Beancount does not auto-roll year-end income to equity, and personal users almost never benefit from manual closing entries. Skip it.
- **Skip `Assets:Receivable` / `Liabilities:Payable` for v1** unless you actually lend/borrow — most users won't. Don't pre-seed empty stubs.

## Cards

Six card kinds across two beancount types. "Card" is the UX primitive; the ledger primitive is the account a card draws from or holds value on.

| kind | beancount type | path prefix | has balance? | constraint commodities |
|---|---|---|---|---|
| `credit-card` | Liabilities | `Liabilities:CreditCards:*` | yes (owed) | single fiat |
| `debit-card` | Assets | `Assets:DebitCards:*` | always 0 (zero-sum) | single fiat |
| `wallet` | Assets | `Assets:Loaded:Wallets:*` | yes | single fiat |
| `prepaid-card` | Assets | `Assets:Loaded:PrepaidCards:*` | yes | single fiat |
| `gift-card` | Assets | `Assets:Loaded:GiftCards:*` | yes | single fiat, often merchant-locked |
| `forex-card` | Assets | `Assets:Loaded:ForexCards:*` | yes | multi-commodity (e.g. USD, EUR, GBP) |

### Out of scope (v1)
- Charge cards — collapse into `credit-card` (structurally same liability).
- Store / co-branded cards (Tata Neu, Shoppers Stop) — collapse into `credit-card`.
- Virtual cards (Amex virtual, Privacy.com) — an access token on a parent card; don't double-count.
- Corporate cards — employer's ledger, not personal.
- EMI cards (Bajaj Finserv) — per-swipe sub-loan structure, too complex for v1.

## Transaction patterns

### Credit card — standard two-posting
```beancount
2026-04-16 * "Blue Tokai" "morning coffee"
  Liabilities:CreditCards:HDFC:Infinia  -220.00 INR
  Expenses:Food:Coffee                    220.00 INR
```

### Debit card — zero-sum pass-through (4 postings)
Debit card account always nets to zero per transaction. Enables per-card analytics without adding metadata.

```beancount
2026-04-16 * "BigBasket" "groceries"
  Assets:Bank:HDFC:Savings     -500.00 INR
  Assets:DebitCards:HDFC:1234   500.00 INR   ; into card
  Assets:DebitCards:HDFC:1234  -500.00 INR   ; out of card
  Expenses:Food:Groceries       500.00 INR
```

### Wallet / prepaid / gift card — load then spend
Stored-value kinds hold a real balance. Two separate transactions: a load (or gift receipt) and a spend.

```beancount
# Load from bank
2026-04-01 * "Paytm" "wallet top-up"
  Assets:Bank:HDFC:Savings  -1000.00 INR
  Assets:Loaded:Wallets:Paytm  1000.00 INR

# Spend against balance
2026-04-16 * "Uber" "auto ride"
  Assets:Loaded:Wallets:Paytm  -85.00 INR
  Expenses:Travel:Local         85.00 INR
```

Gift card received (no bank outflow — booked via plug with tag):
```beancount
2026-04-01 * "Mom" "birthday — Amazon Pay" #gift-in
  Income:Void                     -2000.00 INR
  Assets:Loaded:GiftCards:Amazon   2000.00 INR
```

### Forex card — multi-commodity, conversion folded into price

Load converts INR → USD via `@@` (total price):
```beancount
2026-04-01 * "HDFC" "forex card load"
  Assets:Bank:HDFC:Savings           -50000.00 INR
  Assets:Loaded:ForexCards:HDFC         600.00 USD @@ 50000.00 INR
```

Spend in held currency — no conversion:
```beancount
2026-04-16 * "Café de Flore" "breakfast"
  Assets:Loaded:ForexCards:HDFC  -50.00 USD
  Expenses:Food:Restaurant        50.00 USD
```

Spend in unheld currency — card converts USD → EUR. Markup is folded into the price (not split as a separate Fees posting):
```beancount
2026-04-20 * "Louvre" "admission"
  Assets:Loaded:ForexCards:HDFC  -17.50 USD
  Expenses:Travel:Museums          15.00 EUR @@ 17.50 USD
```

## Constraints

Validation rules enforced at account creation and transaction posting.

### Universal (all kinds)
- Each account is owned by exactly one user.
- Path must match exactly one registered prefix (see resolver below). Unmatched paths rejected at creation.
- `openDate` required; `closeDate` optional. Postings outside this window are rejected.
- `homeCommodity` must be set; all postings default to this commodity unless explicitly priced.

### `credit-card`
- beancount type must be `Liabilities`.
- `homeCommodity` must be a `fiat` commodity (one per card).
- `constraintCommodities` = `[homeCommodity]`. Postings in other commodities rejected (forex spends require explicit conversion via `@@`).
- Balance is non-positive (money owed).

### `debit-card`
- beancount type must be `Assets`.
- `homeCommodity` = the linked bank account's commodity.
- **Zero-sum invariant**: balance MUST be 0 at all times. Every transaction touching this account MUST contain a matching pair of `+X` and `-X` postings on the same account in the same commodity.
- Must declare a `parentAccount` pointing at an `Assets:Bank:*` account. Parent must exist and share `homeCommodity`.

### `wallet`, `prepaid-card`, `gift-card`
- beancount type must be `Assets`.
- `homeCommodity` must be a `fiat` commodity.
- `constraintCommodities` = `[homeCommodity]`. Only one fiat allowed.
- Balance must be ≥ 0 (no overdraft).
- `gift-card` may additionally declare `merchantLock` (optional); txns against non-matching Expense paths produce a warning.

### `forex-card`
- beancount type must be `Assets`.
- `constraintCommodities` is a list of `fiat` commodities (e.g. `[USD, EUR, GBP]`).
- `homeCommodity` is the primary display commodity; doesn't restrict postings.
- Balance must be ≥ 0 per commodity (each bucket non-negative).
- Loads require `@@` or `@` price conversion from the funding account's commodity.
- Cross-currency spends (held commodity → unheld commodity) require `@@` with markup folded into the price.

## Rewards

Two kinds for reward commodities. Both live under `Assets:Rewards:*` and carry non-fiat commodities (airline miles, hotel points, bank points, tier points, elite nights).

| kind | beancount type | path prefix | commodity class | purpose |
|---|---|---|---|---|
| `loyalty-points` | Assets | `Assets:Rewards:Points:*` | `points` | redeemable balance (miles, hotel points, bank points) |
| `status-progress` | Assets | `Assets:Rewards:Status:*` | `status` | tier-qualifying counter (tier points, elite nights) |

### Out of scope (v1)
- Lounge visit counters, insurance/concierge perks — not tracked as commodities.
- Status *tiers* (Gold, Platinum) — these are entity state, not balances. Live on the program entity, not as accounts.

### System plug accounts

All non-cash accruals and burns flow through a single symmetric pair, regardless of commodity or semantic flavor:

| account | role |
|---|---|
| `Income:Void` | single source — reward accruals, cashback, discounts, gifts received, all commodities |
| `Expenses:Void` | single sink — expiry, forfeit, tier reset, gifts given |

Both auto-provisioned per user; hold multiple commodities simultaneously (INR alongside AVIOS, MARRIOTT, KRISFLYER, MAR-NIGHTS, KF-PPS, SBI-RP, SMARTBUY, …). Normal redemptions (points → flight) flow into real `Expenses:*` accounts, not these plugs.

Transaction-level **tags** classify the plug usage. The name "Void" is flavor-agnostic on purpose — classification lives on the transaction, not the account path.

| tag | used on |
|---|---|
| `#reward-accrual` | points / miles / status earned alongside a spend |
| `#reward-expiry` | points / miles / status lost to expiry or tier reset |
| `#cashback` | real-fiat cashback credited back to a card/wallet |
| `#discount` | promo/coupon savings (phantom savings, one instrument leg) |
| `#gift-in` | gift received (inbound) |
| `#gift-out` | gift given (outbound) |

### Consolidation

All earned balance types collapse into `loyalty-points`, distinguished only by commodity:
- Airline miles (`AVIOS`, `KRISFLYER`) — transferable, dynamic value.
- Hotel points (`MARRIOTT`, `HILTON`) — transferable, dynamic value.
- Bank transferable points (`MR`, `HDFC-SMARTBUY`) — convertible to partner programs.
- Bank card-locked points (`SBI-RP`) — redeemable only in issuer's catalog, ~fixed value.
- Aggregators (`POSHVINE`) — same shape.

Transferability is a property of the commodity, not the account.

## Reward transaction patterns

### Earning — multi-commodity txn with single sink

Points earned alongside a spend:
```beancount
2026-04-16 * "BA" "LHR-BOM flight" #reward-accrual
  Liabilities:CreditCards:HDFC:Infinia  -50000.00 INR
  Expenses:Travel:Flights                50000.00 INR
  Assets:Rewards:Points:Avios              500.00 AVIOS
  Income:Void                             -500.00 AVIOS
```

Status earned from a stay:
```beancount
2026-04-16 * "Marriott" "Mumbai stay" #reward-accrual
  Liabilities:CreditCards:HDFC:Infinia  -15000.00 INR
  Expenses:Travel:Hotels                 15000.00 INR
  Assets:Rewards:Status:Marriott             3.00 MAR-NIGHTS
  Income:Void                               -3.00 MAR-NIGHTS
```

### Transfer between programs — `@@` conversion

SmartBuy → Avios at 1:1.5:
```beancount
2026-04-20 * "HDFC SmartBuy" "transfer to Avios"
  Assets:Rewards:Points:SmartBuy     -10000.00 SMARTBUY
  Assets:Rewards:Points:Avios         15000.00 AVIOS @@ 10000.00 SMARTBUY
```

### Redemption — flows to real expense, no sink

Award flight (points + cash for taxes):
```beancount
2026-06-01 * "BA" "award flight"
  Assets:Rewards:Points:Avios           -20000.00 AVIOS
  Liabilities:CreditCards:HDFC:Infinia   -2500.00 INR
  Expenses:Travel:Flights                20000.00 AVIOS
  Expenses:Travel:Flights                 2500.00 INR
```

Card-locked redemption into a voucher:
```beancount
2026-05-10 * "SBI Rewards" "Amazon voucher"
  Assets:Rewards:Points:SBI         -4000.00 SBI-RP
  Assets:Loaded:GiftCards:Amazon     1000.00 INR @@ 4000.00 SBI-RP
```

### Expiry / reset — burn sink

Points expire unused:
```beancount
2026-12-31 * "Avios" "annual expiry" #reward-expiry
  Assets:Rewards:Points:Avios  -2000.00 AVIOS
  Expenses:Void                 2000.00 AVIOS
```

Status resets at year end:
```beancount
2026-12-31 * "Marriott" "tier reset" #reward-expiry
  Assets:Rewards:Status:Marriott  -50.00 MAR-NIGHTS
  Expenses:Void                    50.00 MAR-NIGHTS
```

## Cashback and discounts

Both are recorded inline with the originating txn. They differ in whether money actually moves.

| | Instrument postings | Gross expense shown? | Plug | Tag |
|---|---|---|---|---|
| Discount | 1 (net payment only) | yes | `Income:Void` | `#discount` |
| Cashback | 2 (full outflow + credit back) | yes | `Income:Void` | `#cashback` |

### Discount — net payment, phantom savings

Money never left for the discounted portion. One posting on the instrument.

```beancount
2026-04-16 * "Zomato" "dinner ₹1000 — ₹150 promo" #discount
  Liabilities:CreditCards:HDFC:Infinia   -850.00 INR
  Expenses:Food:Restaurant               1000.00 INR
  Income:Void                            -150.00 INR
```

### Cashback — full payment + credit back

Cashback is a real inflow. The instrument appears twice when the cashback lands on the same card/wallet that paid.

Same-card cashback (10% HDFC offer on Zomato):
```beancount
2026-04-16 * "Zomato" "dinner, 10% HDFC offer" #cashback
  Liabilities:CreditCards:HDFC:Infinia  -1000.00 INR
  Expenses:Food:Restaurant               1000.00 INR
  Liabilities:CreditCards:HDFC:Infinia    100.00 INR
  Income:Void                            -100.00 INR
```

Same-wallet cashback (Paytm 5% on a ride):
```beancount
2026-04-16 * "Zomato" "dinner + 5% Paytm cashback" #cashback
  Assets:Loaded:Wallets:Paytm    -1000.00 INR
  Expenses:Food:Restaurant        1000.00 INR
  Assets:Loaded:Wallets:Paytm        50.00 INR
  Income:Void                       -50.00 INR
```

Cross-instrument cashback (Amazon via Infinia, cashback to Amazon Pay):
```beancount
2026-04-16 * "Amazon" "headphones + ₹150 AmazonPay cashback" #cashback
  Liabilities:CreditCards:HDFC:Infinia  -3000.00 INR
  Expenses:Shopping:Electronics          3000.00 INR
  Assets:Loaded:Wallets:AmazonPay         150.00 INR
  Income:Void                            -150.00 INR
```

Bill payment with app cashback (CRED pays into CRED wallet):
```beancount
2026-04-10 * "CRED" "HDFC bill + ₹25 CRED cashback" #cashback
  Assets:Bank:HDFC:Savings              -10000.00 INR
  Liabilities:CreditCards:HDFC:Infinia   10000.00 INR
  Assets:Loaded:Wallets:CRED                 25.00 INR
  Income:Void                               -25.00 INR
```

### Statement-level cashback (standalone)

When cashback is credited later as a statement event rather than per-txn:
```beancount
2026-04-30 * "HDFC" "Infinia April statement cashback" #cashback
  Liabilities:CreditCards:HDFC:Infinia    250.00 INR
  Income:Void                            -250.00 INR
```

Pending/accrued cashback is not tracked.

### Income/Expense map

Single plug pair for everything non-cash; distinguish semantics via tags.

| account | role |
|---|---|
| `Income:Void` | all inbound plug entries (accrual, cashback, discount, gift-in) — any commodity |
| `Expenses:Void` | all outbound plug entries (expiry, reset, forfeit, gift-out) — any commodity |

## Path-to-kind resolver

```
Liabilities:CreditCards:*    → credit-card
Assets:DebitCards:*          → debit-card
Assets:Loaded:Wallets:*      → wallet
Assets:Loaded:PrepaidCards:* → prepaid-card
Assets:Loaded:GiftCards:*    → gift-card
Assets:Loaded:ForexCards:*   → forex-card
Assets:Rewards:Points:*      → loyalty-points
Assets:Rewards:Status:*      → status-progress
```

Unmatched paths are rejected at account creation. Typos like `Liabilities:CreditCards:*` (the old abbreviated form) or `Assets:Loaded:Wallet:*` (singular) fail loudly.

Constraints and validation rules for reward kinds: TBD.
