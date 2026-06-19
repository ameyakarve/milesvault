# milesvault-email — transaction-email ingestion worker

Receives forwarded **transaction emails** (card alerts, receipts) — not statements;
attachments are ignored entirely (text body only, by design). Resolves the `+token`
to a user via the `ingest_tokens` D1 table (minted by
`/api/ledger/forwarding-address`), lands the message as a `captured` item in that
user's `LedgerDO`, then kicks the draft on a **per-email `ChatDO`** (`email::<id>`) —
the same headless path statement uploads use (the LLM draft runs in the DO, with
ledger access).

The secret `+token` is the **only** trust boundary — there is no sender allow/deny
list. Unknown tokens are rejected at SMTP time, and a user rotates the token to
revoke. Nothing is ever auto-posted; review happens in the Inbox.

## Environments

Two envs, each cross-script bound to the matching app worker's DOs:

    pnpm exec wrangler deploy --env staging      # milesvault-email-staging -> milesvault-staging DOs
    pnpm exec wrangler deploy --env production    # milesvault-email         -> milesvault prod DOs
                                                  #   (deploy prod only when the prod app is current)

Addresses differ by **local part** (Email Routing is apex-only — no subdomains):
prod `ingest+<token>@milesvault.com`, staging `ingest-staging+<token>@milesvault.com`.
The app mints the right one per env via the `INGEST_EMAIL_ADDRESS` var; the worker's
token regex is prefix-agnostic, so one codebase serves both.

## One-time zone setup (dashboard, manual)

Email Routing on the `milesvault.com` apex zone:

1. Cloudflare dashboard → milesvault.com → **Email → Email Routing** → enable (adds
   the MX/SPF records; confirm the zone sends no other mail first).
2. **Routing rules → Custom addresses → Create** — one per env, **Send to a Worker**:
   - `ingest@milesvault.com` → `milesvault-email` (production)
   - `ingest-staging@milesvault.com` → `milesvault-email-staging` (staging)
   Plus-addressing is automatic: an `ingest@` rule matches every `ingest+<token>@`.
3. Test: copy your forwarding address from the Inbox and forward a transaction alert
   to it — it should appear as a drafting → drafted item within seconds.
