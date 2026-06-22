authors: Ameya Karve
summary: Learn how your MilesVault ledger really works by writing it yourself — open your first accounts and record a transaction in plain beancount, then watch the AI produce the very same thing.
id: ledger-foundations
categories: milesvault, beancount
environments: Web
status: Published
feedback link: https://milesvault.com

# Lab 4 · Under the hood: accounts & your first transaction

## What you'll learn
Duration: 2:00

MilesVault is an **operating system for your points and miles** — and like any OS, it runs on something underneath. That something is a plain-text **beancount** ledger: the source of truth for every point, mile, and rupee you track. The AI writes it for you, but it's always yours — you can read and edit every line.

This lab makes you fluent in the basics by having you *write them yourself*:

- The one rule behind double-entry bookkeeping
- The five kinds of accounts
- How to **open** your own accounts by hand
- How to **record a transaction** as text — and what makes it valid
- How the **AI produces the exact same beancount**, so you can trust and check its drafts

> aside positive
> 
> **Why learn the raw format at all?** Because once you can read a transaction, you can verify every draft the AI makes, catch mistakes, and fix anything by hand. You stay in control of your own data.

By the end you'll have a real account and a real transaction in your ledger — typed by you.

## The one rule: double-entry
Duration: 2:00

Beancount is **double-entry**, which sounds technical but is a single idea:

> **Money always moves _from_ one place _to_ another. Every transaction adds up to zero.**

If you spend ₹500 on coffee with a credit card, ₹500 *leaves* your available credit and ₹500 *arrives* as a food expense. Two sides, equal and opposite — they sum to zero.

Every account you'll ever use starts with one of **five words**:

| Root | What it means | Examples |
|---|---|---|
| **Assets** | what you *have* | bank balance, wallet money, reward points & miles |
| **Liabilities** | what you *owe* | credit cards, loans |
| **Income** | money coming *in* | salary, interest |
| **Expenses** | money going *out*, by category | food, travel, shopping |
| **Equity** | the balancing bucket | opening balances, adjustments |

> aside positive
> 
> **The one sign rule:** a credit card is a **liability**, and what you owe is shown as a **negative** number. A purchase makes it *more* negative (you owe more); a payment makes it *less* negative. Everything else reads naturally.

## Find your raw ledger
Duration: 2:00

Let's open the actual text file behind your vault.

1. In the left menu, click **Journal**.
2. You'll see two panes (or two tabs on mobile): **Chat** and **Journal**. Click into the **Journal** side.
3. That editor — with the coloured syntax — **is your beancount ledger**. Anything you type here and save is written straight to your vault.

To save your work in this lab you'll use the **Save** button at the top of the Journal pane (or press **Cmd-S** / **Ctrl-S**). A small chip shows **Unsaved** → **Saving…** → **Saved**.

> aside negative
> 
> This is your real ledger, not a sandbox. Everything here is **synthetic example data** — use made-up names and round numbers as you follow along, exactly as shown. You can delete these practice lines afterwards.

## Open your first accounts
Duration: 3:00

Before tracking anything, we declare the accounts we'll use with the **`open`** directive. Type these two lines into the Journal (the text after `;` is just a comment — beancount ignores it):

```beancount
2026-06-01 open Assets:Bank:HDFC:Savings INR                   ; a bank account you own
2026-06-01 open Liabilities:CreditCards:HDFC:Infinia:7788 INR  ; a credit card — note the :7788 id
```

Each line is: a **date**, the word **`open`**, the **account path** (general → specific, separated by colons), and the **currency** it holds.

Now press **Save** (or Cmd-S). The chip should read **Saved**.

> aside negative
> 
> **Two rules the ledger enforces — get these wrong and the save is rejected:**
> 
> - A credit-card account is `Liabilities:CreditCards:<Issuer>:<Card>:<Id>` — issuer, card name, and a short **id** (use the card's last 4 digits, e.g. `:7788`). **Always include the id** so two of the same card never collide. The word is **`CreditCards`**, one word.
> - An `open` for a bank or card account names **exactly one** currency (here, `INR`). No currency, or two, is an error.
> - **Comments use a semicolon.** Put a `;` after the content on a line and everything to its right is a note the ledger ignores — exactly like the `; a bank account you own` notes above. Beancount has **no `#` comment lines**: a `#` at the **start** of a line breaks the parse.

## Record your first transaction
Duration: 4:00

Now the real thing. Add this purchase below your `open` lines:

```beancount
2026-06-02 * "Blue Tokai" "Morning coffee"
  Expenses:Food:Coffee                        500.00 INR   ; where the money went (a category)
  Liabilities:CreditCards:HDFC:Infinia:7788  -500.00 INR   ; what you now owe (negative)
```

Reading it top to bottom:

- **Date**, then **`*`** (a confirmed transaction), then the **payee** (`"Blue Tokai"`) and a short **note** (`"Morning coffee"`).
- Two **postings**, indented. Each names an account, an amount, and a currency. The `;` notes are optional comments.
- The two amounts sum to zero: `500 + (−500) = 0`. The expense went up by 500; what you owe on the card went up by 500 (shown negative).

Press **Save**. It's now in your ledger.

> aside positive
> 
> **Why must it sum to zero?** That's the integrity check at the heart of double-entry — every rupee that arrives somewhere came from somewhere. MilesVault checks this **per currency** on every save.

### Now break it on purpose
Change the card line to `-400.00 INR` and press **Save**. The save is **rejected** — the transaction no longer balances (`500 + (−400) = 100`). Change it back to `-500.00 INR` and save again. That rejection is the ledger protecting you from a bad entry.

> aside negative
> 
> A few things the ledger insists on: **every posting needs an explicit amount and currency** (no blank/inferred legs), and an **expense leg must be in a real currency** like INR — never in points. We'll meet points next lab.

## Now let the AI do it
Duration: 3:00

You've written beancount by hand. Here's the payoff: the AI writes the *same* thing.

1. Switch to the **Chat** pane.
2. Type, in plain words:

> *Spent 500 on coffee at Blue Tokai on my HDFC Infinia*

3. The assistant replies with a **Proposed transaction** card — and inside it is beancount you can now *read*. You'll recognise the date, payee, the `Expenses:Food:Coffee` leg and the negative card leg, all balancing to zero.
4. Click **Approve** to commit it (or **Reject** since you already logged this one by hand).

> aside positive
> 
> Notice the AI may add **two extra lines** for the reward points the card earned. That's the four-posting purchase shape — we cover it fully in **Lab 6**. For now, see that the *expense* and *card* legs are exactly what you wrote: the AI didn't do anything you can't read.

This is the whole point: the AI is fast, but you can verify every draft because you understand what it's producing.

## The faster way: Add accounts
Duration: 2:00

Typing `open` lines by hand is great for understanding — day to day, there's a shortcut that writes them for you.

1. On **Home** (your vault), click **+ Card** (or use the **Add accounts** chip in the chat).
2. Search for a card (e.g. *Axis Magnus*, *HDFC Infinia*) or, on the programmes tab, a loyalty programme (e.g. *KrisFlyer*, *Marriott*).
3. Select and **Save**.

Behind the scenes this writes the same kind of `open` directive you typed by hand. Tip: add the card's **last-4 id** (e.g. `:7788`) so that if you ever hold two of the same card, your ledger keeps them apart.

> aside positive
> 
> Hand-typing and the modal produce the **same ledger entries**. Use whichever you like — now you know exactly what each one does.

## Recap & what's next
Duration: 1:00

You just:

- Learned the one rule of double-entry and the five account roots
- **Opened** your own accounts in raw beancount (with the `:id` on the card) and saved them
- **Recorded** a transaction by hand, saw it balance, and watched a bad one get rejected
- Confirmed the **AI produces the same beancount** — so you can trust and check it

In **Lab 5 · Opening balances** you'll assert what a card *actually* owes today, watch a wrong assertion get rejected, and use `pad` to set an opening balance — by hand, then with the **Update balance** tool.

<button>
<a href="../opening-balances/">Start Lab 5 · Opening balances →</a>
</button>

> aside positive
> 
> **You're now beancount-literate.** Everything else in MilesVault — points, miles, redemptions, statements — is just more of these same building blocks. 🙌
