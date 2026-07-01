# Admin endpoints

Operator-only endpoints served by the worker wrapper (`scripts/inject-do.mjs`),
BEFORE Next.js middleware. They live under `/api/admin/*`, which the middleware
matcher excludes from the normal auth redirect — each endpoint gates itself.

## `GET /api/admin/dump-ledger`

Dump any user's ledger as beancount text, for member data recovery / support.

- **Query:** `?key=<storage_key>` (required) — the durable storage key (email for
  legacy users, snowflake uid otherwise; see `docs/design/discord-identity.md`).
  Optional `&t=<RECOVERY_TOKEN>` for token auth.
- **Returns:** `text/plain` beancount (read-only — `LedgerDO.journal_get`). Empty
  body means that key's LedgerDO has no data.
- **Auth (either):**
  1. **Owner session** — open the URL in a browser while signed in as the owner
     (`session.user.key === ALLOWED_EMAILS[0]`). Works over https (reads the
     `__Secure-authjs.session-token` cookie with a matching salt).
  2. **`RECOVERY_TOKEN`** prod secret via `?t=` — for curl without a cookie.

### When to use it

A member whose data sits under a **stale storage key** (e.g. their old email)
after a re-key to their uid: dump the old key so they can re-add it, or so we can
inspect / migrate it. Example (owner, in browser):

```
https://milesvault.com/api/admin/dump-ledger?key=someone@example.com
```

### Secret

`RECOVERY_TOKEN` — a prod worker secret (`wrangler secret put RECOVERY_TOKEN`).
Rotate by putting a new value. Only needed for the `?t=` curl path; the owner
session path needs no secret.

## `POST /api/admin/workflows/<name>`

Manually trigger a named Cloudflare Workflow (e.g. `refresh-magnify`). Owner-only
(`__resolveAuth` key must equal `ALLOWED_EMAILS[0]`).
