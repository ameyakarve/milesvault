authors: Ameya Karve
summary: Tell your ledger what your accounts actually hold today — write a balance assertion, watch a wrong one get rejected, and use pad to set an opening balance, by hand and with the Update balance tool.
id: opening-balances
categories: milesvault, beancount
environments: Web
status: Published
feedback link: https://milesvault.com

# Lab 3 · Opening balances: pad & balance

## What you'll learn
Duration: 2:00

Your accounts exist (Lab 2), but beancount assumes they start at **zero**. A real credit card you've held for years already owes money; an airline account already has miles. This lab is about telling the ledger the **truth as of today** — and doing it safely.

You'll learn two new directives by writing them yourself:

- **`balance`** — assert what an account *should* hold on a date (a checkpoint)
- **`pad`** — fill the gap automatically so an opening balance just *works*, without typing years of history

> aside positive
> 
> These two are how every statement you ever import gets reconciled. Understand them once here and the rest of MilesVault makes sense.

## A balance assertion is a checkpoint
Duration: 3:00

A **`balance`** line asserts what an account should hold at the **start** of a given date. If you followed Lab 2, your card shows −500 INR from the coffee purchase on 2026-06-02. Let's assert that.

Type this into the Journal and **Save**:

```beancount
2026-06-03 balance Liabilities:CreditCards:HDFC:Infinia:7788  -500.00 INR   ; what it should hold today
```

It saves cleanly — because the ledger's running balance at the start of 2026-06-03 really is −500 INR.

> aside positive
> 
> **Why the next day?** A `balance` asserts the figure at the *start* of its date — before that day's activity. The coffee was on the 2nd, so we check it on the 3rd. (Hold that thought — `pad` uses the same rule.)

### Now break it on purpose
Change the figure to `-600.00 INR` and **Save**. The save is **rejected** with a balance-assertion error — the ledger computed −500 but you asserted −600. Put it back to `-500.00 INR` and save.

> aside negative
> 
> A bare `balance` (with no `pad`, which is next) is a **hard check**. It's your safety net: when you import a statement, you assert its closing balance, and if anything drifted by even a rupee, MilesVault tells you.

## Set an opening balance with pad
Duration: 4:00

Here's the real problem: you want to add a card you've held for years that already owes **₹12,638.52**. You don't have the old transactions — and you shouldn't have to type them.

**`pad`** solves this. Placed just before a `balance`, it tells the ledger: *"insert whatever single adjustment is needed here — booked against a plug account — to make the next assertion true."* MilesVault's plug account is **`Equity:Void`**.

Type all three lines and **Save**:

```beancount
2026-06-01 open Liabilities:CreditCards:Axis:Magnus:4021 INR               ; the card you're adding
2026-06-01 pad Liabilities:CreditCards:Axis:Magnus:4021 Equity:Void        ; fills the gap from Equity:Void
2026-06-02 balance Liabilities:CreditCards:Axis:Magnus:4021  -12638.52 INR ; the balance it should hold
```

What happened: the `pad` (dated the 1st) quietly created an adjustment of −12,638.52 from `Equity:Void`, so that by the start of the 2nd the balance assertion holds. Your card now correctly owes ₹12,638.52 — with zero history typed.

> aside positive
> 
> Notice the pattern: **`pad` on day D, `balance` on day D+1.** Same start-of-day rule as before. This is the exact shape MilesVault uses everywhere it sets or reconciles a balance.

## A gotcha: pad never travels alone
Duration: 2:00

A `pad` only makes sense paired with a `balance` that tells it the target. On its own it's meaningless — and the ledger rejects it.

Try it: type just this line and **Save**:

```beancount
2026-06-01 pad Liabilities:CreditCards:HDFC:Infinia:7788 Equity:Void   ; no matching balance → rejected
```

The save is **rejected** — a `pad` with no matching `balance` for the same account is not a valid directive. Delete that line.

> aside negative
> 
> **Rule of thumb:** every `pad` needs a `balance` for the same account right after it. Think of them as a single move in two lines.

## Now let the AI do it
Duration: 2:00

You've hand-written a `pad`+`balance` pair. The assistant can produce the same pair from a plain request.

1. Switch to the **Chat** pane.
2. Type, in plain words:

> *Set my Axis Magnus balance to ₹12,638.52 as of 1 June*

3. The assistant drafts the same **`pad` + `balance`** pair — plugged to `Equity:Void`, with the assertion dated the **day after** — for you to review. Read it, confirm it matches what you typed, and **Approve** (or **Reject**, since you've done this by hand).

> aside positive
> 
> The assistant knows the start-of-day rule and the `Equity:Void` plug, so it lays the pair out exactly as you learned — you just check and approve.

## The faster way: the Update balance tool
Duration: 2:00

There's also a dedicated form for this — no typing at all.

1. In the chat pane, click the **Update balance** chip (the scales icon).
2. Choose an account (e.g. your `Axis:Magnus:4021` card), type the balance it should hold, and pick an "as of" date.
3. Confirm. You'll see: *"A pad absorbed the difference into Equity:Void."*

Open the **Journal** and look at what it added — a `pad` on your chosen date and a `balance` the **day after**, plugged to **`Equity:Void`**. Identical to what you typed by hand, and to what the AI drafts.

> aside positive
> 
> Three routes to the same pair: **by hand**, **by chat**, or **by the form**. They all write identical beancount — pick whatever's quickest in the moment.

## Recap & what's next
Duration: 1:00

You can now:

- Write a **`balance`** assertion and use it as a safety-net checkpoint
- See a wrong assertion get **rejected** — and trust that rejection
- Use **`pad`** + **`balance`** to set an opening balance with no history
- Recognise that the **Update balance** tool writes the very same pair

In **Lab 4 · Cards, points & miles** you'll model the thing MilesVault is really about: the **reward points and miles** a card earns — as their own currency — including the four-line purchase shape and the "pending then posted" life of a point.

<button>
<a href="../modelling-rewards/">Start Lab 4 · Cards, points & miles →</a>
</button>

> aside positive
> 
> Two directives down. From here on, it's all about **points**. 🙌
