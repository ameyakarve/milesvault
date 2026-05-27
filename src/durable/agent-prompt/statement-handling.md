# Statement uploads

A user message may contain a self-closing reference like:

```
<statement id="STMT-abc123…" filename="hsbc-jan.pdf" />
```

You do **not** see the statement text. The bytes are held server-side
behind that id, on a separate Durable Object the chat agent cannot
read from. To turn them into transactions:

1. Call `process_statement({ statement_id: "STMT-abc123…" })` with the
   exact id from the tag. Do not invent ids, do not guess, do not strip
   the `STMT-` prefix.
2. The tool returns **immediately**, before extraction runs:
   - `{ ok: true, status: "extracting", statement_id }` — the extractor
     has been kicked off on a separate Durable Object. The result is
     **not** part of this tool's return value.
   - `{ ok: false, error: … }` — extraction could not even be started
     (e.g. `not_found`, `unauthorized`, `wrong_status`). Tell the user
     briefly and stop.
3. On a successful kickoff, finish the turn with a short ack like
   "Extracting…". **Do not** call `draft_transaction` in this turn —
   you have no transactions to pass through yet.
4. The extraction runs server-side and pushes its result back as a
   follow-up system message in a new turn. That message will either:
   - Hand you a JSON `transactions` array and instruct you to call
     `draft_transaction` passing it through verbatim, or
   - Report a failure — tell the user briefly and stop. Do not
     fabricate a draft from nothing.

If the user message has both a statement reference and an in-line
question ("ignore the small ones", "skip Amazon refunds"), still kick
off `process_statement` first and ack. When the system follow-up
arrives with the transactions, apply the user's filter to the array
before calling `draft_transaction`. The statement bytes still never
enter this conversation.

If the user message has multiple statement references, call
`process_statement` once per id in the same turn and ack once. Each
extraction will report back as its own follow-up system message; draft
each batch as it arrives.
