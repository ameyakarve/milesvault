authors: Ameya Karve
summary: Spend your points well — redeem miles for an award flight, transfer points between programmes at a ratio, and track elite-status progress. Then see how the ledger you wrote powers Award Explorer, Points, and Status Match.
id: redemptions-and-tools
categories: milesvault, beancount
environments: Web
status: Published
feedback link: https://milesvault.com

# Lab 7 · Under the hood: redemptions, transfers & status

## What you'll learn
Duration: 2:00

Earning points is only half of it — the payoff is **spending them well**. This lab covers the moves that make miles worth chasing, and connects your ledger to MilesVault's planning tools.

You'll write:

- A **redemption** — spending miles on an award flight
- A **transfer** — moving points between programmes at a ratio
- A **status** entry — tracking progress toward elite tiers

…and then see your ledger drive **Award Explorer**, **Points**, and **Status Match**.

> aside positive
> 
> New idea this lab: a small **`@`** or **`@@`** on a line is a *price* — a conversion rate. It's how one currency (miles) gets valued in another (rupees, or another programme's points).

## First, give yourself some miles
Duration: 2:00

To redeem, you need miles to spend. Let's seed a balance using the `pad`+`balance` move from Lab 5 — this time on a rewards account. Type and **Save**:

```beancount
2026-06-01 open Assets:Rewards:KrisFlyer KRISFLYER            ; the programme account
2026-06-01 pad Assets:Rewards:KrisFlyer Equity:Void           ; fill the gap from the plug
2026-06-02 balance Assets:Rewards:KrisFlyer  20000 KRISFLYER  ; miles you hold today
```

You now hold **20,000 KrisFlyer miles**. (Reward accounts can hold any number of different point types — no special setup needed.)

> aside positive
> 
> Look how Lab 5 paid off: the same `pad`+`balance` pair that set a card's debt just seeded a miles balance. The building blocks repeat.

## Redeem miles for an award flight
Duration: 4:00

When you book an award flight, the miles leave your balance and pay for the trip — valued at **what the cash fare would have been**. Type and **Save**:

```beancount
2026-06-25 * "Singapore Airlines" "Award flight"
  Expenses:Travel:Flights         15000.00 INR              ; the trip, valued at its cash fare
  Assets:Rewards:KrisFlyer     -7125 KRISFLYER @@ 15000.00 INR  ; 7,125 miles, worth ₹15,000
```

The **`@@`** means *total price*: those 7,125 miles are worth ₹15,000 here. So the miles line carries a weight of −₹15,000, which balances the ₹15,000 expense — while your KrisFlyer balance drops by 7,125 miles.

> aside positive
> 
> **Why value it at the cash fare?** So your spending reports stay honest — that trip really was worth ₹15,000 of travel, even though you paid in miles. Your "Travel" expenses reflect reality.

## Transfer points between programmes
Duration: 3:00

Card points often convert into airline or hotel currencies at a ratio. Here, 2,000 card points become 1,000 miles (a 2:1 transfer). Type and **Save**:

```beancount
2026-06-10 * "Transfer" "HDFC points → KrisFlyer, 2:1"
  Assets:Rewards:HDFC             -2000 HDFC-RP @ 0.5 KRISFLYER  ; each point = 0.5 miles
  Assets:Rewards:KrisFlyer   1000 KRISFLYER               ; 2000 × 0.5 = 1000 miles
```

The **`@`** (single) is a *per-unit* price: each HDFC point is worth 0.5 miles, so 2,000 × 0.5 = 1,000 miles. The miles currency nets to zero; your HDFC pool drops by 2,000.

> aside negative
> 
> A price must be in a **different** currency from the line it's on (miles priced in points, not in miles), and it can't be zero. `2000 HDFC-RP @ 0 KRISFLYER` or self-pricing is rejected.

## Track progress toward status
Duration: 3:00

Some spend earns points **and** counts toward elite status. A qualifying hotel stay racks up points *and* status nights — and the nights are their own counter. Type and **Save**:

```beancount
2026-06-12 * "Marriott" "2-night stay — qualifying"
  Expenses:Travel:Lodging                    18000.00 INR            ; the room cost
  Liabilities:CreditCards:HDFC:Infinia:7788 -18000.00 INR            ; paid on the card
  Assets:Rewards:Marriott                 9000 MARRIOTT       ; points earned
  Equity:Void                                   -9000 MARRIOTT       ; counterweight
  Assets:Rewards:Marriott                    2 MARRIOTT-NIGHT ; qualifying nights toward status
  Equity:Void                                      -2 MARRIOTT-NIGHT ; counterweight
```

Three currencies, each balancing to zero: rupees, Marriott points, and **status nights**. Those nights are what your vault's programme tile shows as *"N nights"* progress toward the next tier.

> aside positive
> 
> Notice the points (`MARRIOTT`) and the nights (`MARRIOTT-NIGHT`) sit in the **same** `Assets:Rewards:Marriott` account — the **ticker** is what tells them apart. A programme is one account; the commodities are its different balances (spendable points, status counters, and so on). You never make a separate `…:Status:` or `…:Points:` account.

> aside positive
> 
> Status is just another counter in its own unit. Once it's in the ledger, MilesVault can show you how close you are to the next tier — and Status Match can suggest shortcuts.

## See your ledger power the tools
Duration: 2:00

Everything you typed now feeds the planning tools in the left menu — no extra setup:

- [**Award Explorer**](https://milesvault.com/explore) — search a route and cabin. Because you hold 20,000 KrisFlyer miles, affordable awards get a **"You have the points"** flag; others show how a transfer gets you there.
- [**Points**](https://milesvault.com/points) — pick a target programme and see every route from your cards, at what ratio (the same transfers you just wrote, mapped out).
- [**Status Match**](https://milesvault.com/status-match) — your Marriott progress and any tiers you hold are recognised, with paths to match them elsewhere.

> aside positive
> 
> This is the reward for going beancount-first: the tools aren't magic, they're **reading the ledger you understand**. Garbage in, garbage out — and now you know how to keep it clean.

## Recap — you've gone the whole way
Duration: 1:00

You can now put points to work in raw beancount:

- **Redeem** miles with `@@`, valued at the cash fare
- **Transfer** between programmes with an `@` ratio
- Track **status** as its own counter
- And you've seen **Award Explorer / Points / Status Match** read it all

That's the full picture — from signing in, to logging a few transactions, to the planning tools, all the way down to the ledger that powers them. Day to day you'll live in the chat and the tools; but when you want to read or fix a line yourself, now you can.

<button>
<a href="https://milesvault.com/vault">Open MilesVault</a>
</button>

> aside positive
> 
> The AI does the work; you stay in control — because now you can read every line. Go make those points fly. 🙌
