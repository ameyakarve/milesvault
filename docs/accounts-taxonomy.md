# Accounts — Kinds & Path Prefixes

Accounts carry a `kind` derived from the first two path segments. The derivation is a pure function from path → kind. Path is beancount-native; kind is MilesVault's typing layer for analytics, UI, and validation.

## Cards

Six card kinds across two beancount types. "Card" is the UX primitive; the ledger primitive is the account a card draws from or holds value on.

| kind | beancount type | path prefix | has balance? | constraint commodities |
|---|---|---|---|---|
| `credit-card` | Liabilities | `Liabilities:CC:*` | yes (owed) | single fiat |
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
  Liabilities:CC:HDFC:Infinia  -220.00 INR
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

Gift card received (no bank outflow — booked as income):
```beancount
2026-04-01 * "Mom" "birthday — Amazon Pay"
  Income:Gifts                    -2000.00 INR
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

### System sinks

Rewards use a single pair of system-reserved accounts for mint/burn magic:

| account | role |
|---|---|
| `Income:Rewards` | mint sink — where all reward commodities originate |
| `Expenses:Rewards` | burn sink — expiry, forfeit, tier reset |

Both auto-provisioned per user; hold multiple commodities simultaneously. Normal redemptions (points → flight) flow into real `Expenses:*` accounts, not these sinks.

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
2026-04-16 * "BA" "LHR-BOM flight"
  Liabilities:CC:HDFC:Infinia  -50000.00 INR
  Expenses:Travel:Flights                50000.00 INR
  Assets:Rewards:Points:Avios              500.00 AVIOS
  Income:Rewards                          -500.00 AVIOS
```

Status earned from a stay:
```beancount
2026-04-16 * "Marriott" "Mumbai stay"
  Liabilities:CC:HDFC:Infinia  -15000.00 INR
  Expenses:Travel:Hotels                 15000.00 INR
  Assets:Rewards:Status:Marriott             3.00 MAR-NIGHTS
  Income:Rewards                            -3.00 MAR-NIGHTS
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
  Liabilities:CC:HDFC:Infinia   -2500.00 INR
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
2026-12-31 * "Avios" "annual expiry"
  Assets:Rewards:Points:Avios  -2000.00 AVIOS
  Expenses:Rewards              2000.00 AVIOS
```

Status resets at year end:
```beancount
2026-12-31 * "Marriott" "tier reset"
  Assets:Rewards:Status:Marriott  -50.00 MAR-NIGHTS
  Expenses:Rewards                 50.00 MAR-NIGHTS
```

## Cashback and discounts

Both are recorded inline with the originating txn. They differ in whether money actually moves.

| | Instrument postings | Gross expense shown? | Sink |
|---|---|---|---|
| Discount | 1 (net payment only) | yes | `Income:Savings:Discounts` |
| Cashback | 2 (full outflow + credit back) | yes | `Income:Rewards:Cashback` |

### Discount — net payment, phantom savings

Money never left for the discounted portion. One posting on the instrument.

```beancount
2026-04-16 * "Zomato" "dinner ₹1000 — ₹150 promo"
  Liabilities:CC:HDFC:Infinia   -850.00 INR
  Expenses:Food:Restaurant               1000.00 INR
  Income:Savings:Discounts               -150.00 INR
```

### Cashback — full payment + credit back

Cashback is a real inflow. The instrument appears twice when the cashback lands on the same card/wallet that paid.

Same-card cashback (10% HDFC offer on Zomato):
```beancount
2026-04-16 * "Zomato" "dinner, 10% HDFC offer"
  Liabilities:CC:HDFC:Infinia  -1000.00 INR
  Expenses:Food:Restaurant               1000.00 INR
  Liabilities:CC:HDFC:Infinia    100.00 INR
  Income:Rewards:Cashback                -100.00 INR
```

Same-wallet cashback (Paytm 5% on a ride):
```beancount
2026-04-16 * "Zomato" "dinner + 5% Paytm cashback"
  Assets:Loaded:Wallets:Paytm    -1000.00 INR
  Expenses:Food:Restaurant        1000.00 INR
  Assets:Loaded:Wallets:Paytm        50.00 INR
  Income:Rewards:Cashback           -50.00 INR
```

Cross-instrument cashback (Amazon via Infinia, cashback to Amazon Pay):
```beancount
2026-04-16 * "Amazon" "headphones + ₹150 AmazonPay cashback"
  Liabilities:CC:HDFC:Infinia  -3000.00 INR
  Expenses:Shopping:Electronics          3000.00 INR
  Assets:Loaded:Wallets:AmazonPay         150.00 INR
  Income:Rewards:Cashback                -150.00 INR
```

Bill payment with app cashback (CRED pays into CRED wallet):
```beancount
2026-04-10 * "CRED" "HDFC bill + ₹25 CRED cashback"
  Assets:Bank:HDFC:Savings              -10000.00 INR
  Liabilities:CC:HDFC:Infinia   10000.00 INR
  Assets:Loaded:Wallets:CRED                 25.00 INR
  Income:Rewards:Cashback                   -25.00 INR
```

### Statement-level cashback (standalone)

When cashback is credited later as a statement event rather than per-txn:
```beancount
2026-04-30 * "HDFC" "Infinia April statement cashback"
  Liabilities:CC:HDFC:Infinia    250.00 INR
  Income:Rewards:Cashback                -250.00 INR
```

Pending/accrued cashback is not tracked.

### Income/Expense map

| account | role |
|---|---|
| `Income:Rewards` | mint sink for phantom commodities (points, status) |
| `Income:Rewards:Cashback` | real fiat cashback |
| `Income:Savings:Discounts` | POS discount savings |
| `Expenses:Rewards` | burn sink (expiry, reset, forfeit) |

## Path-to-kind resolver

```
Liabilities:CC:*    → credit-card
Assets:DebitCards:*          → debit-card
Assets:Loaded:Wallets:*      → wallet
Assets:Loaded:PrepaidCards:* → prepaid-card
Assets:Loaded:GiftCards:*    → gift-card
Assets:Loaded:ForexCards:*   → forex-card
Assets:Rewards:Points:*      → loyalty-points
Assets:Rewards:Status:*      → status-progress
```

Unmatched paths are rejected at account creation. Typos like `Liabilities:Credit-Cards:*` or `Assets:Loaded:Wallet:*` (singular) fail loudly.

Constraints and validation rules for reward kinds: TBD.
