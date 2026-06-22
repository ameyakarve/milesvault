authors: Ameya Karve
summary: Model the heart of MilesVault — the reward points and miles your cards earn. Write the four-posting purchase by hand, track points from pending to posted, handle forex and cashback, then watch the AI produce the same shape automatically.
id: modelling-rewards
categories: milesvault, beancount
environments: Web
status: Published
feedback link: https://milesvault.com

# Lab 6 · Under the hood: cards, points & miles

## What you'll learn
Duration: 2:00

This is the core of the operating system: every swipe doesn't just cost money, it **earns points or miles** — and MilesVault's whole job is to capture every one. In this lab you'll record both sides of a purchase in one entry — by hand — and learn how MilesVault keeps points honest.

You'll write:

- A **four-posting purchase** that captures the spend *and* the reward
- The **pending → posted** life of a point
- A **forex** purchase, with markup & GST
- **Cashback** vs a **discount** — why the same ₹50 is recorded two different ways

> aside positive
> 
> **Points are their own currency.** A reward point isn't a rupee — it's counted in its own unit (a "ticker" like `HDFC-RP`). That's how MilesVault keeps your miles from ever getting mixed up with money.

## A purchase that earns points
Duration: 4:00

In Lab 4 a purchase was two lines. A purchase that earns rewards is **four**. Type this and **Save** (the `;` notes explain each line — beancount ignores them):

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
> **Why `Equity:Void` again?** Points aren't moved *from* anywhere real — the bank conjures them. `Equity:Void` is the counterweight that lets the points line balance to zero, the same plug you met in Lab 5.

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

## A foreign-currency swipe
Duration: 3:00

Spend abroad and the charge is in a **foreign currency** — the bank converts it to rupees, adds a **markup**, and charges **GST** on that markup. Record the **real foreign amount** with **`@@`** for what it converted to, and itemise the markup and GST as their own INR lines:

```beancount
2026-06-08 * "Tokyo Hotel" "2 nights — ¥30,000 (+₹577.50 markup +₹103.95 GST)"
  Expenses:Travel:Lodging          30000 JPY @@ 16500.00 INR  ; ¥30,000, converted to ₹16,500
  Expenses:Financial:ForexMarkup               577.50 INR     ; the bank's 3.5% markup
  Expenses:Financial:GST                       103.95 INR     ; 18% GST on the markup
  Liabilities:CreditCards:HDFC:Infinia:7788 -17181.45 INR     ; total added to the card
```

The **`@@`** means *total price*: the expense keeps its true face value of **¥30,000** but carries a **weight of ₹16,500** for the balance check — so the rupee side nets to zero (16,500 + 577.50 + 103.95 = 17,181.45 on the card) while your ledger remembers you spent yen.

> aside negative
> 
> **Don't pre-convert the expense to INR.** Record what you actually paid (`30000 JPY`) and let `@@` carry the rupee value — that keeps the real foreign amount *and* the bank's exact rate.

> aside positive
> 
> **Rewards on forex:** if the card earns, compute it on the **purchase amount only** (the ₹16,500) — never on the markup or GST — and add the same `:Pending` + `Equity:Void` pair from earlier.

## Cashback (redeemable later)
Duration: 2:00

When cashback is credited **separately** — it lands on a later statement or in a cashback pool you redeem — the **full price** still shows as your expense. The cashback accrues as money owed back to you (four postings):

```beancount
2026-06-09 * "Swiggy" "Dinner — ₹20 cashback"
  Expenses:Food:Restaurants                  400.00 INR   ; the full bill stays the expense
  Liabilities:CreditCards:HSBC:LivePlus:5096 -400.00 INR ; added to the card
  Assets:Receivable:HSBC                      20.00 INR   ; cashback owed back to you
  Equity:Void                                -20.00 INR   ; counterweight
```

**Save** it — every currency nets to zero, as always.

> aside positive
> 
> Keeping cashback off the expense line means your reports stay honest: the dinner really cost ₹400, and the ₹20 is a separate little win you collect later.

## A discount (knocked off at the till)
Duration: 2:00

Different story when the saving is applied **right then** — "₹50 off", "10% instant discount", "cashback at checkout". You paid less, so the **expense itself is smaller**. Record the saving as a negative line on the *same* expense — no receivable, no `Equity:Void`, just **three lines**:

```beancount
2026-06-11 * "Swiggy" "Dinner — ₹50 instant discount"
  Expenses:Food:Restaurants    500.00 INR   ; the menu price
  Expenses:Food:Restaurants   -50.00 INR    ; the discount, off the same expense
  Liabilities:CreditCards:HDFC:Infinia:7788 -450.00 INR  ; what you actually paid
```

Net expense = **₹450** (what it really cost you), the card paid ₹450, and there's nothing to collect later.

> aside positive
> 
> **Discount vs cashback — the one test:** did it reduce what you paid *right now*? → **discount** (shrink the expense, 3 lines). Is it a credit you collect *later*? → **cashback** (full expense + a receivable, 4 lines). Same ₹50, completely different entry — decide by the economics, not the card's name.

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

In **Lab 7 · Redemptions, transfers & status** you'll *spend* points: redeem miles for an award flight, transfer points between programmes at a ratio, and track progress toward elite status — then watch your ledger light up the **Award Explorer**, **Points**, and **Status Match** tools.

<button>
<a href="../redemptions-and-tools/">Start Lab 7 · Redemptions, transfers & status →</a>
</button>

> aside positive
> 
> You now model rewards the way MilesVault does. Time to put those points to work. 🙌
