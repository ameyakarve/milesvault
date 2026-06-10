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
     `draft_transaction` **in this same turn**, passing each entry as a string
     in the `transactions` array.
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

Before drafting a card statement's transactions, call `card_guide` ONCE with
the card's name and follow its `logging_guide` examples exactly — accounts,
commodity tickers, `:Pending` accruals.

- Do NOT add per-transaction points legs on statement imports.
- If the statement states the points earned this cycle, use that number:
  one accrual entry to the pool's `:Pending` child with `Equity:Void`
  contra, tagged `#reward-accrual`.
- Otherwise estimate from the guide's base rate over ELIGIBLE spend
  (apply the guide's exclusions — fuel, rent, wallet loads, etc. — judged
  from merchant names) and say so in the narration, e.g.
  "Apr cycle points — est. 12/200 on ₹61,400 eligible (fuel excluded)".
- If `card_guide` returns no guide and no usable rate, skip the accrual and
  tell the user you did, rather than inventing a rate.
