# Statement uploads

A user message may contain a self-closing reference like:

```
<statement id="STMT-abc123…" filename="hsbc-jan.pdf" />
```

The statement text is held server-side behind that id. To turn it into
transactions:

1. Call `read_statement({ statement_id: "STMT-abc123…" })` with the exact id
   from the tag. Do not invent ids, do not guess, do not strip the `STMT-`
   prefix.
2. The tool returns the statement inline:
   - `{ ok: true, filename, text }` — `text` is the full raw statement. Extract
     the transactions from it (see the extraction rules below) and call
     `draft_transaction` **in this same turn**, passing each entry as
     `{ id, text }` (one beancount entry per `text`) in the `entries` array.
     That SAME `entries` array must ALSO END with the closing bookends — a
     pad+balance for the card's closing outstanding and a pad+balance for the
     points closing balance (extraction rules §6–7). They are entries in the
     batch just like the transactions; the import is INCOMPLETE without them, so
     never stop after the transaction rows.
   - `{ ok: false, error: "not_found" }` — the id is unknown. Tell the user
     briefly and stop.
3. If the statement genuinely has nothing to record, say so briefly and do not
   call `draft_transaction` — never fabricate entries.

If the user message has both a statement reference and an in-line instruction
("ignore the small ones", "skip Amazon refunds"), read the statement and apply
that filter before drafting.

If the user message has multiple statement references, read each id and draft
its batch. You can call `read_statement` again at any time if you need to
re-check the source text — the statement stays available for the whole
conversation.


## Reward accrual on card statements

If you ALREADY hold the card's reward pool — an `Assets:Rewards:…` account in
the open-accounts list — draft directly: you have the pool account and its
ticker there, and a card statement prints the points earned PER ROW, so you
have the amounts too. Do NOT call `card_guide` in that case; just use the held
pool. Call `card_guide` ONCE only when the reward pool is NOT among your held
accounts (a card you don't yet track) — to get its pool account + ticker, which
you must never guess. Either way, follow the guide's `logging_guide` shape —
accounts, commodity tickers, `:Pending` accruals.

- EVERY eligible spend entry carries its own points legs (the guide's
  earn example): `pool.account`:Pending + `Equity:Void` contra in
  `pool.ticker`, points = floor(amount / per) × points at the base rate.
- Excluded categories per the guide (fuel, rent, wallet loads,
  government/tax — judged from merchant names) get NO points legs.
- A null `logging_guide` does NOT mean skip: if `pool.rate_notes` states a
  base rate (e.g. "12 RP / ₹200"), apply it the same way.
- Only when there is no guide AND no usable rate anywhere do you draft
  plain spends — and then tell the user you skipped accruals, rather than
  inventing a rate.
