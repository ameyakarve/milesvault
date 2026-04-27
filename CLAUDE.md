# MilesVault — Claude Code instructions

## Stack

Next.js 15 App Router on Cloudflare Workers via `@opennextjs/cloudflare`. Auth is `next-auth` with Google OAuth. Per-user state lives in a `LedgerDO` Durable Object (SQLite). Read-only ledger API under `src/app/api/ledger/v2/`.

## Environment

- D1 database: `c5e6c9e1-6020-4772-a568-714a57e0bf0f` (bound, currently unused by app code)
- Cloudflare account: `e0bc1f55dc6fc3f8fe870087199a2ee3`
- Production worker: `milesvault` → milesvault.com
- Staging worker: `milesvault-staging` → staging.milesvault.com
- Deploy: push to `main` → GitHub Actions auto-deploys staging via `pnpm run deploy`. Production deploy is manual (`workflow_dispatch`).
- Push with `env -u GH_TOKEN git push` (fine-grained PAT lacks repo access; gh keyring token does).
