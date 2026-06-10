# milesvault-email — transaction-email ingestion worker

Receives `ingest+<token>@milesvault.com` — for forwarded **transaction
emails** (card alerts, receipts), not statements; attachments are ignored
entirely. Resolves the token to a user via the `ingest_tokens` D1 table
(minted by `/api/ledger/forwarding-address`), consults the user's email
rules (`/inbox/rules`: first enabled match wins — `ignore` drops the mail,
`capture` attaches the rule's prompt), and lands the message as a `captured`
item in that user's `LedgerDO`. Unknown tokens are rejected at SMTP time.
Nothing is ever auto-posted — review happens in the Journal chat ("Review in
chat" on the Inbox row, which uses the rule's prompt when one matched).

Deploy (not part of the app's CI):

    pnpm exec wrangler deploy --config workers/email/wrangler.jsonc

## One-time zone setup (dashboard, manual)

The worker is deployed but receives no mail until Email Routing is enabled on
the `milesvault.com` zone:

1. Cloudflare dashboard → milesvault.com → **Email → Email Routing** →
   enable (this adds the MX/SPF records; confirm the zone sends no other
   mail first).
2. **Routing rules → Custom addresses → Create**: address `ingest`, action
   **Send to a Worker**, worker `milesvault-email`.
   Plus-addressing is automatic: the single `ingest@` rule matches every
   `ingest+<token>@milesvault.com`.
3. Test: copy your forwarding address from the Inbox page and forward a
   transaction alert to it — it should appear as a `captured` item within
   seconds.

Current limitations (v1, deliberate): text body only by design (transaction
emails, no attachments); targets
the **staging** app worker for now (production is stale — flip `script_name`
in wrangler.jsonc when prod is deployed); no auto-post and no trusted-source
gate yet — everything lands as `needs review`, which is the trust contract's
safe default.
