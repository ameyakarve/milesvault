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
  Prepaid:Wallets:<issuer>[:<id>]       food / store / payment wallets — see "Cards"
  Prepaid:Forex:<issuer>[:<id>]         forex cards (multi-commodity) — see "Cards"
  Prepaid:GiftCards:<merchant>[:<id>]   money-pegged, merchant-locked gift cards / vouchers — see "Cards"
  DebitCards:*                          see "Cards" section
  Rewards:Points|Status:*               see "Rewards" section

Liabilities
  CreditCards:<issuer>:<product>        e.g. Liabilities:CreditCards:HDFC:Infinia
  Loan:Mortgage|Auto|Student|Personal:<lender>
  Payable:<name>                        IOUs you owe

Equity
  Opening-Balances                      one entry per account at user onboarding
  Adjustments                           reconciliation plug — pad drift on ongoing balance corrections (NOT onboarding)
  Void                                  reward-commodity mint/burn contra (points/miles/status) — see "System plug accounts"

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
  - Cashback (deferred): `#cashback` tag, full purchase + an `Assets:Receivable:<Issuer>` accrual + a matching expense reduction; settles to the instrument when credited. The expense is the contra — no plug. See "Cashback and discounts" below.
  - Refunds: same shape as cashback when traceable to the original txn; otherwise model as a negative posting on the original `Expenses:*` category.
  - Untraceable rebates (rare): `Expenses:Misc:Rewards` is acceptable; don't invent `Income:Cashback`.
- **`Misc` stays small.** If a row repeats more than 2–3 months, promote it to a real second-level category.
- **No `Equity:Earnings` rollup.** Beancount does not auto-roll year-end income to equity, and personal users almost never benefit from manual closing entries. Skip it.
- **Skip `Assets:Receivable` / `Liabilities:Payable` for v1** unless you actually lend/borrow — most users won't. Don't pre-seed empty stubs. (Deferred cashback is the one exception: it creates `Assets:Receivable:<Issuer>` on demand and clears it on settlement — see "Cashback and discounts".)

## Cards

Five card kinds across two beancount types. "Card" is the UX primitive; the ledger primitive is the account a card draws from or holds value on. Stored value lives under `Assets:Prepaid`, split into fixed buckets per instrument kind (`Wallets`, `Forex`, `GiftCards`) — nothing sits bare at `Assets:Prepaid:<x>`. Currency is carried by the commodity, never the path, so a forex card holding USD/EUR is one account.

| kind | beancount type | path prefix | has balance? | constraint commodities |
|---|---|---|---|---|
| `credit-card` | Liabilities | `Liabilities:CreditCards:*` | yes (owed) | single fiat |
| `debit-card` | Assets | `Assets:DebitCards:*` | always 0 (zero-sum) | single fiat |
| `wallet` | Assets | `Assets:Prepaid:Wallets:*` | yes | single fiat |
| `forex-card` | Assets | `Assets:Prepaid:Forex:*` | yes | multi-commodity (e.g. USD, EUR, GBP) |
| `gift-card` | Assets | `Assets:Prepaid:GiftCards:*` | yes | single fiat, money-pegged, merchant-locked |

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
  Assets:Bank:HDFC:Savings      -1000.00 INR
  Assets:Prepaid:Wallets:Paytm   1000.00 INR

# Spend against balance
2026-04-16 * "Uber" "auto ride"
  Assets:Prepaid:Wallets:Paytm  -85.00 INR
  Expenses:Travel:Local          85.00 INR
```

Gift card received (no bank outflow — booked via plug with tag):
```beancount
2026-04-01 * "Mom" "birthday — Amazon Pay" #gift-in
  Income:Void                      -2000.00 INR
  Assets:Prepaid:GiftCards:Amazon   2000.00 INR
```

### Forex card — multi-commodity, conversion folded into price

Under the `Forex` bucket; the foreign commodity (not the path) marks the currency. Load converts INR → USD via `@@` (total price):
```beancount
2026-04-01 * "HDFC" "forex card load"
  Assets:Bank:HDFC:Savings  -50000.00 INR
  Assets:Prepaid:Forex:HDFC    600.00 USD @@ 50000.00 INR
```

Spend in held currency — no conversion:
```beancount
2026-04-16 * "Café de Flore" "breakfast"
  Assets:Prepaid:Forex:HDFC  -50.00 USD
  Expenses:Food:Restaurant    50.00 USD
```

Spend in unheld currency — card converts USD → EUR. Markup is folded into the price (not split as a separate Fees posting):
```beancount
2026-04-20 * "Louvre" "admission"
  Assets:Prepaid:Forex:HDFC  -17.50 USD
  Expenses:Travel:Museums     15.00 EUR @@ 17.50 USD
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

The `Assets:Rewards:*` tree splits by **minting source** (decided 2026-06-10).
Identity lives in the **commodity ticker** (globally unique, registered as
`ticker` on the KG's currency nodes); the account path is organization.

| subtree | holds | example |
|---|---|---|
| `Assets:Rewards:Miles:<Programme>` | airline FFP miles | `Assets:Rewards:Miles:KrisFlyer` → `KRISFLYER` |
| `Assets:Rewards:Points:<Programme>` | hotel + other programme points (rail, car-rental file here too) | `Assets:Rewards:Points:Marriott` → `MARRIOTTBONVOY` |
| `Assets:Rewards:<Issuer>` | bank/card reward wallet — ONE account per issuer (decided 2026-06-11: the account says WHERE points live; the commodity says WHAT they are, tier-precise, and carries the transfer semantics) | `Assets:Rewards:Axis` → `AXIS-EDGE-BURGUNDY` |
| `Assets:Rewards:Status:<Programme>` | tier-qualifying counters | `Assets:Rewards:Status:Marriott` → `MAR-NIGHTS` |

### Tickers (commodity = primary key)

- Bank pools are issuer-prefixed: `HDFC-RP`, `AXIS-EDGE`, `SBI-RP`
  (`MR` grandfathered for Amex). Programme currencies use their entrenched
  code: `KRISFLYER`, `AVIOS`. The KG's ticker registry is the source of
  truth; apps match holdings to the graph by commodity, never by path.
- Pool variants with different values (HDFC Infinia-DCB vs Regalia points)
  are distinct KG currencies → distinct commodities (`HDFC-RP-INFINIA`) →
  distinct accounts. When ambiguous, the agent asks which card earned them.

### Pending — immediate vs future credit

Any programme account may have a `:Pending` child (same commodity) holding
earned-but-not-yet-credited balances — card points before statement close,
miles before the airline posts them:

```
2026-06-01 * "SQ423 BLR-SIN" "miles accrue on flying"   #reward-accrual
  Assets:Rewards:Miles:KrisFlyer:Pending   2400 KRISFLYER
  Equity:Void

2026-07-10 * "KrisFlyer" "miles credited"
  Assets:Rewards:Miles:KrisFlyer:Pending  -2400 KRISFLYER
  Assets:Rewards:Miles:KrisFlyer           2400 KRISFLYER
```

A never-credited accrual is a one-line reversal of the Pending posting.
Beancount's tree arithmetic gives both views: the parent rolls up to
total-including-pending, the split shows what's actually spendable.
Spendable reads (award affordability, transfer planning) exclude
`:Pending`; instant-credit programmes simply never use the child.

### Out of scope (v1)
- Lounge visit counters, insurance/concierge perks — not tracked as commodities.
- Status *tiers* (Gold, Platinum) — these are entity state, not balances. Live on the program entity, not as accounts.

### System plug accounts

Plug entries balance a transaction whose other side has no real
counter-account. The plug splits by whether the plugged leg is a **reward
commodity** or **fiat**:

| account | role |
|---|---|
| `Equity:Void` | reward-commodity mint/burn — points / miles / status **accrual, expiry, reset, forfeit, clawback**. Non-fiat (AVIOS, KRISFLYER, MAR-NIGHTS, HDFC-RP, …); stays on the balance sheet, off the P&L — a points accrual is not fiat income. |
| `Income:Void` | fiat inbound plug — value entering the ledger from outside it (cash gifts received). Cashback/discounts do NOT use it — they net against the expense (see "Cashback and discounts"). |
| `Expenses:Void` | fiat outbound plug — value leaving the ledger (cash gifts given, fiat write-offs). |

All three are auto-provisioned per user and hold multiple commodities simultaneously (Equity:Void carries AVIOS, MARRIOTT, KRISFLYER, MAR-NIGHTS, KF-PPS, SBI-RP, SMARTBUY, …; Income:Void/Expenses:Void carry INR). Normal redemptions (points → flight) flow into real `Expenses:*` accounts, not these plugs.

Transaction-level **tags** classify the plug usage. The name "Void" is flavor-agnostic on purpose — classification lives on the transaction, not the account path.

| tag | plug | used on |
|---|---|---|
| `#reward-accrual` | `Equity:Void` | points / miles / status earned alongside a spend |
| `#reward-expiry` | `Equity:Void` | points / miles / status lost to expiry or tier reset |
| `#cashback` | `Assets:Receivable` | deferred cashback — accrues to a receivable, settles when credited |
| `#discount` | none (expense contra) | immediate promo/coupon savings — negative leg on the same expense |
| `#gift-in` | `Income:Void` | cash gift received (inbound) |
| `#gift-out` | `Expenses:Void` | cash gift given (outbound) |

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
  Assets:Rewards:Miles:Avios              500.00 AVIOS
  Equity:Void                             -500.00 AVIOS
```

Status earned from a stay:
```beancount
2026-04-16 * "Marriott" "Mumbai stay" #reward-accrual
  Liabilities:CreditCards:HDFC:Infinia  -15000.00 INR
  Expenses:Travel:Hotels                 15000.00 INR
  Assets:Rewards:Status:Marriott             3.00 MAR-NIGHTS
  Equity:Void                               -3.00 MAR-NIGHTS
```

### Transfer between programs — `@@` conversion

SmartBuy → Avios at 1:1.5:
```beancount
2026-04-20 * "HDFC SmartBuy" "transfer to Avios"
  Assets:Rewards:HDFC                -10000.00 SMARTBUY
  Assets:Rewards:Miles:Avios          15000.00 AVIOS @@ 10000.00 SMARTBUY
```

### Redemption — flows to real expense, no sink

Award flight (points + cash for taxes):
```beancount
2026-06-01 * "BA" "award flight"
  Assets:Rewards:Miles:Avios           -20000.00 AVIOS
  Liabilities:CreditCards:HDFC:Infinia   -2500.00 INR
  Expenses:Travel:Flights                20000.00 AVIOS
  Expenses:Travel:Flights                 2500.00 INR
```

Card-locked redemption into a voucher:
```beancount
2026-05-10 * "SBI Rewards" "Amazon voucher"
  Assets:Rewards:SBI               -4000.00 SBI-RP
  Assets:Prepaid:GiftCards:Amazon   1000.00 INR @@ 4000.00 SBI-RP
```

### Expiry / reset — burn sink

Points expire unused:
```beancount
2026-12-31 * "Avios" "annual expiry" #reward-expiry
  Assets:Rewards:Miles:Avios  -2000.00 AVIOS
  Equity:Void                   2000.00 AVIOS
```

Status resets at year end:
```beancount
2026-12-31 * "Marriott" "tier reset" #reward-expiry
  Assets:Rewards:Status:Marriott  -50.00 MAR-NIGHTS
  Equity:Void                      50.00 MAR-NIGHTS
```

## Cashback and discounts

The split is **timing**. A **discount** is immediate — it reduced the bill you
paid, nothing to redeem later. **Cashback** is deferred — ₹X posted back
separately, redeemable on a later statement, so it accrues to an account until
it lands. Neither uses an `Income:Void` plug: the expense reduction is the
contra.

| | Shape | Plug | Tag |
|---|---|---|---|
| Discount | negative leg on the same expense; instrument pays the net | none (expense is the contra) | `#discount` |
| Cashback | full purchase + `Assets:Receivable:<Issuer>` accrual + expense reduction; settles when credited | none (expense is the contra) | `#cashback` |

### Discount — immediate, phantom savings

The discount reduced the bill at purchase. A negative posting on the same
expense; the instrument pays the net. No receivable, no plug.

```beancount
2026-04-16 * "Zomato" "dinner ₹1000 — ₹150 promo" #discount
  Expenses:Food:Restaurant               1000.00 INR
  Expenses:Food:Restaurant               -150.00 INR
  Liabilities:CreditCards:HDFC:Infinia   -850.00 INR
```

### Cashback — deferred, accrues to a receivable

A separately-redeemable credit (₹X back, redeemable later). Four postings:
the purchase (2) + the receivable accrual (+) + the matching expense
reduction (−). The expense leg is the contra — no `Income:Void`. The card
pays the full amount; the ₹X owed sits in `Assets:Receivable:<Issuer>` until
it lands; the expense nets to the post-cashback figure.

```beancount
2026-04-16 * "Zomato" "dinner, 10% HDFC cashback" #cashback
  Expenses:Food:Restaurant               1000.00 INR
  Liabilities:CreditCards:HDFC:Infinia  -1000.00 INR
  Assets:Receivable:HDFC                  100.00 INR
  Expenses:Food:Restaurant               -100.00 INR
```

### Cashback settles (credited on a later statement)

When the issuer credits it, the receivable is drawn down against whatever
instrument it lands on — the card that earned it, a wallet, or bank. No
expense, no plug; a pure receivable → instrument move.

```beancount
2026-04-30 * "HDFC" "Infinia statement cashback credited"
  Liabilities:CreditCards:HDFC:Infinia    100.00 INR
  Assets:Receivable:HDFC                 -100.00 INR
```

Accrued-but-uncredited cashback stays visible in `Assets:Receivable:<Issuer>`
until this settlement posts.

### Plug map

Full split lives in "System plug accounts" above; distinguish semantics via tags.

| account | role |
|---|---|
| `Equity:Void` | reward-commodity mint/burn — accrual, expiry, reset, forfeit, clawback (points/miles/status) |
| `Income:Void` | fiat inbound plug entries — cash gift-in (cashback/discount net against the expense, not here) |
| `Expenses:Void` | fiat outbound plug entries — cash gift-out, fiat write-offs |

## Path-to-kind resolver

```
Liabilities:CreditCards:*    → credit-card
Assets:DebitCards:*          → debit-card
Assets:Prepaid:Wallets:*     → wallet
Assets:Prepaid:Forex:*       → forex-card
Assets:Prepaid:GiftCards:*   → gift-card
Assets:Rewards:Points:*      → loyalty-points
Assets:Rewards:Status:*      → status-progress
```

Everything under `Assets:Prepaid` lives in one of the three fixed buckets (`Wallets`, `Forex`, `GiftCards`) — nothing sits bare at `Assets:Prepaid:<x>`. Unmatched paths are rejected at account creation.

Constraints and validation rules for reward kinds: TBD.
