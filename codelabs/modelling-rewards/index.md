authors: Ameya Karve
summary: Model the heart of MilesVault — the reward points and miles your cards earn. Write the four-posting purchase by hand, track points from pending to posted, handle forex and cashback, then watch the AI produce the same shape automatically.
id: modelling-rewards
categories: milesvault, beancount
environments: Web
status: Published
feedback link: https://milesvault.com

# Lab 4 · Cards, points & miles

## What you'll learn
Duration: 2:00

This is the core of the operating system: every swipe doesn't just cost money, it **earns points or miles** — and MilesVault's whole job is to capture every one. In this lab you'll record both sides of a purchase in one entry — by hand — and learn how MilesVault keeps points honest.

You'll write:

- A **four-posting purchase** that captures the spend *and* the reward
- The **pending → posted** life of a point
- A **forex** purchase and a **cashback** credit

> aside positive
> 
> **Points are their own currency.** A reward point isn't a rupee — it's counted in its own unit (a "ticker" like `HDFC-RP`). That's how MilesVault keeps your miles from ever getting mixed up with money.

## A purchase that earns points
Duration: 4:00

In Lab 2 a purchase was two lines. A purchase that earns rewards is **four**. Type this and **Save** (the `;` notes explain each line — beancount ignores them):

```beancount
2026-06-05 * "Amazon" "Headphones"
  Expenses:Shopping:Electronics               3000.00 INR      ; the cost, by category
  Liabilities:CreditCards:HDFC:Infinia:7788  -3000.00 INR      ; added to what you owe
  Assets:Rewards:HDFC:Pending                   100.00 HDFC-RP ; points earned, not yet credited
  Equity:Void                                  -100.00 HDFC-RP ; counterweight so the points balance
```

Read it as two pairs:

- **Lines 1–2** are the purchase you already know: ₹3,000 expense, ₹3,000 added to what the card owes.
- **Lines 3–4** are the reward: **100 points** land in a `:Pending` bucket, balanced against **`Equity:Void`**.

> aside positive
> 
> **Why `Equity:Void` again?** Points aren't moved *from* anywhere real — the bank conjures them. `Equity:Void` is the counterweight that lets the points line balance to zero, the same plug you met in Lab 3.

Notice the entry balances **per currency**, independently: INR nets to zero (3000 − 3000), and HDFC-RP nets to zero (100 − 100). MilesVault checks each currency separately.

> aside negative
> 
> **Points never go on the expense line.** An expense must be in a real currency (INR, USD…). `Expenses:Shopping 100 HDFC-RP` is rejected. Money is the cost; points are a separate, parallel reward.

## Pending now, posted later
Duration: 3:00

Points are usually **earned now but credited weeks later**. That's why they first land in `:Pending`. When the statement finally posts them, you move them into the real balance.

Type this and **Save**:

```beancount
2026-06-20 * "Statement close" "Points posted"
  Assets:Rewards:HDFC          100.00 HDFC-RP   ; arrives in the spendable pool
  Assets:Rewards:HDFC:Pending -100.00 HDFC-RP   ; leaves the pending bucket
```

The 100 points leave `:Pending` and arrive in the spendable pool. It's a pure move — HDFC-RP nets to zero.

> aside positive
> 
> This split is why your vault can show **"4,250 pts · 120 pending"** — it always knows what's truly usable versus still in flight. No guessing.

## Forex and cashback
Duration: 3:00

Two everyday variations.

**A foreign-currency swipe** breaks the bank's markup out as its own fee, so you can see what the conversion cost:

```beancount
2026-06-08 * "Tokyo Hotel" "2 nights"
  Expenses:Travel:Lodging                    16500.00 INR      ; the room cost
  Expenses:Financial:Fees:Forex                577.50 INR      ; the 3.5% forex markup
  Liabilities:CreditCards:HDFC:Infinia:7788 -17077.50 INR      ; total added to the card
  Assets:Rewards:HDFC:Pending                  569.00 HDFC-RP  ; points on the full amount
  Equity:Void                                 -569.00 HDFC-RP  ; counterweight
```

**Cashback** is credited separately, so the full price still shows as your expense:

```beancount
2026-06-09 * "Swiggy" "Dinner — ₹20 cashback"
  Expenses:Food:Restaurants                  400.00 INR   ; the full bill stays the expense
  Liabilities:CreditCards:HSBC:LivePlus:5096 -400.00 INR ; added to the card
  Assets:Receivable:HSBC                      20.00 INR   ; cashback owed back to you
  Equity:Void                                -20.00 INR   ; counterweight
```

**Save** each. In both, every currency still nets to zero — check it yourself.

> aside positive
> 
> See the pattern? However complex the swipe, it's just the same building blocks: an expense, the card, and balanced reward/fee legs.

## Now let the AI do it
Duration: 3:00

Here's the moment it all pays off. Switch to the **Chat** pane and type:

> *Bought headphones for 3000 on my HDFC Infinia*

The assistant drafts a **Proposed transaction** — and it's the **four-posting shape you just wrote by hand**: expense, card, pending points, `Equity:Void`. It even knows the card's earn rate from its built-in card guide, so the points figure is filled in for you.

Glance at it, confirm it matches what you'd write, and **Approve** (or **Reject**, since you logged this by hand already).

> aside positive
> 
> This is the whole philosophy: the AI does the lookups and the typing, but it produces nothing you can't read. You're the reviewer who actually understands the entry.

## Recap & what's next
Duration: 1:00

You can now model rewards like the app itself:

- The **four-posting purchase** — spend plus the points it earns
- Points as their **own currency**, balanced against **`Equity:Void`**
- The **pending → posted** move
- **Forex** fees and **cashback** credits
- And you've seen the **AI draft the exact same shape**

In **Lab 5 · Redemptions, transfers & status** you'll *spend* points: redeem miles for an award flight, transfer points between programmes at a ratio, and track progress toward elite status — then watch your ledger light up the **Award Explorer**, **Points**, and **Status Match** tools.

<button>
<a href="../redemptions-and-tools/">Start Lab 5 · Redemptions, transfers & status →</a>
</button>

> aside positive
> 
> You now model rewards the way MilesVault does. Time to put those points to work. 🙌
