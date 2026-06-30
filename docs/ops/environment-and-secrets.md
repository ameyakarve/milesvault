# Environment, secrets & config — audit

A complete map of **where configuration and secrets are read** and **where they
are stored**, across every worker and process. No secret *values* live in this
doc (or anywhere in the repo) — only key names, locations, and purpose.

Last audited: 2026-06-30. Regenerate the deployed-secret lists with
`wrangler secret list` / `wrangler secret list --env staging`.

## TL;DR — the stores

| Store | What lives there | Committed? | Notes |
|---|---|---|---|
| `wrangler.jsonc` → `vars` | Non-sensitive config (per env) | ✅ yes | plaintext, safe |
| `wrangler.jsonc` → bindings | DO / D1 / R2 / AI / FLAGS / services | ✅ yes | handles, not secrets |
| Cloudflare **Worker secrets** | All runtime secrets (`wrangler secret put`) | ❌ no | per-worker, per-env |
| `.dev.vars` | Local-dev Worker secrets | ❌ gitignored | mirrors prod secrets for `wrangler dev` |
| `.env` | Local Next.js build/runtime secrets | ❌ gitignored | overlaps `.dev.vars` |
| **GitHub Actions secrets** | CI deploy creds + admin token | ❌ (GH-managed) | see CI section |
| OCI box `/opt/discord-dm/.env` | Discord bridge creds | ❌ off-Cloudflare | see bridge section |

There are **three reading mechanisms**: Cloudflare bindings (`env.X` /
`this.env.X` at runtime), `process.env.X` (Next build + Node scripts), and
plain files read by tooling (`.dev.vars`, `.env`).

## Workers inventory

| Worker | Config | Prod name | Staging name | Trigger |
|---|---|---|---|---|
| Main app | `wrangler.jsonc` | `milesvault` | `milesvault-staging` | HTTP (custom domain) + daily cron |
| Email ingest | `workers/email/wrangler.jsonc` | `milesvault-email` | `milesvault-email-staging` | Cloudflare Email Routing |
| Telegram adapter | `workers/telegram/wrangler.jsonc` | — | `milesvault-telegram` | HTTP webhook (binds staging DO) |
| KB (knowledge graph) | *separate repo/service* | `milesvault-kb` | `milesvault-kb-staging` | service binding `KB` |
| Discord DM bridge | `bridge/discord-dm/` | OCI box (off-CF) | — | Discord Gateway WS |

Prod is the **top-level** `wrangler.jsonc` config; `staging` is the one named
`env`. Named envs do **not** inherit top-level bindings — they're fully
re-declared.

## Bindings (non-secret handles) — main app worker

| Binding | Type | Prod | Staging |
|---|---|---|---|
| `ASSETS` | Static assets | ✓ | ✓ |
| `D1` | D1 database | `milesvault` (`c5e6c9e1-…`) | same DB id (shared) |
| `LEDGER_DO` `CHAT_DO` `CONCIERGE_DO` `MEMBERSHIP_DO` `AIRPORTS_DO` | Durable Objects | ✓ | ✓ |
| `AI` | Workers AI | ✓ | ✓ |
| `REFRESH_MAGNIFY` | Workflow | `refresh-magnify` | `refresh-magnify-staging` |
| `R2` | R2 bucket | `milesvault` | `milesvault-staging` |
| `KB` | Service binding | `milesvault-kb` | `milesvault-kb-staging` |
| `LOADER` | Worker Loader (codemode sandbox) | ✓ | ✓ |
| `FLAGS` | Flagship (`app_id 27041ed3-…`) | ✓ | ✓ |
| `PROD` | Service binding → `milesvault` | — | ✓ (staging only) |

Daily cron `30 3 * * *` → `REFRESH_MAGNIFY` (see `inject-do.mjs` `scheduled`).
Note `D1` is a **single shared database** across prod + staging (it holds only
routing maps — `user_keys`, `ingest_tokens`, bot pairing — not ledger content;
content lives in per-env DOs).

## Plaintext vars (`wrangler.jsonc` → `vars`)

| Var | Prod | Staging | Read by |
|---|---|---|---|
| `APP_ENV` | `production` | `staging` | `whatsapp.ts` (origin), build |
| `CLOUDFLARE_ACCOUNT_ID` | `e0bc1f55…` | same | tooling (no app code ref) |
| `AI_GATEWAY_ID` | `milesvault` | `milesvault-staging` | `base-agent-do.ts`, `chat-do.ts` |
| `INGEST_EMAIL_ADDRESS` | `ingest@milesvault.com` | `ingest-staging@…` | `ledger/forwarding-address` route |
| `ENABLE_HYDRATE` | — | `1` | (no app code ref — verify) |

## Secrets (Cloudflare Worker secrets)

Set via `wrangler secret put NAME` (prod) / `… --env staging`. **✓ = present on
that worker** (from `wrangler secret list`, 2026-06-30).

| Secret | Prod | Staging | Read by | Purpose |
|---|---|---|---|---|
| `AUTH_SECRET` | ✓ | ✓ | `inject-do.mjs` (next-auth JWT) | session-cookie signing |
| `AUTH_DISCORD_ID` / `_SECRET` | ✓ | ✓ | `auth.config.ts` | Discord OAuth (login identity) |
| `AUTH_GOOGLE_ID` / `_SECRET` | ✓ | ✓ | `membership-do.ts` | Google/YouTube OAuth (membership poll) |
| `DISCORD_GUILD_ID` | ✓ | ✓ | `auth.ts` | guild for the membership-role check |
| `DISCORD_MEMBER_ROLE_ID` | ✓ | ✓ | `auth.ts` | role that grants app access |
| `DISCORD_BRIDGE_SECRET` | ✓ | ✓ | `inject-do.mjs` (`/api/discord/dm`) | Discord DM bridge trust boundary |
| `WHATSAPP_ACCESS_TOKEN` | ✓ | ✓ | `whatsapp.ts` | Graph API calls |
| `WHATSAPP_APP_SECRET` | ✓ | ✓ | `whatsapp.ts` | webhook HMAC verify |
| `WHATSAPP_PHONE_NUMBER_ID` | ✓ | ✓ | `whatsapp.ts` | send endpoint |
| `WHATSAPP_VERIFY_TOKEN` | ✓ | ✓ | `whatsapp.ts`, `inject-do.mjs` | webhook GET handshake |
| `WHATSAPP_BUSINESS_NUMBER` | ✓ | ✓ | `bot/pairing-code` route | wa.me deep link |
| `AERODATABOX_API_KEY` | ✓ | ✓ | `concierge-do.ts` | flight/airport data |
| `FORWARDEMAIL_WEBHOOK_KEY` | ✓ | ✓ | `api/email/ingest` route | inbound-email webhook auth |
| `LINEAR_API_KEY` / `_TEAM_ID` / `_STATE_ID` | ✓ | ✓ | `lib/linear.ts` | Linear issue creation |
| `CF_AIG_TOKEN` | ✓ | ✓ | **none found** | legacy AI-gateway auth — likely dead |
| `ALLOWED_EMAILS` | **✗** | ✓ | `membership.ts`, `inject-do.mjs` | owner/allowlist gate — **missing on prod** |
| `TEST_USER_TOKEN` | **✗** | ✓ | `middleware.ts`, `auth.ts`, `api/test/*` | e2e test identity — correctly prod-absent |
| `AI_GATEWAY_NAME` | ✗ | ✓ | **none found** | likely dead (superseded by `AI_GATEWAY_ID` var) |
| `CHAT_MODEL` | ✗ | ✓ | **none found** | likely dead (model id is hardcoded in DOs) |

Read in code but **not set on either worker** (so resolves to undefined —
treated as optional): `LINEAR_LABEL_ID` (`lib/linear.ts`).

### Telegram worker secrets

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (`workers/telegram/src/index.ts`).
The telegram worker binds `CONCIERGE_DO` with `script_name: milesvault-staging`,
i.e. it currently points at **staging** — a staging-only/experimental adapter.

The email worker holds **no secrets** — it only binds DOs (`LEDGER_DO`,
`CHAT_DO`, cross-script to the app) + `DB`, and is invoked by Email Routing.

## `process.env.*` reads (build + Node scripts, not Worker runtime)

| Var | Where | Purpose |
|---|---|---|
| `AUTH_DISCORD_ID` / `_SECRET` | `auth.config.ts` | next-auth reads these at build/runtime via `process.env` |
| `CLOUDFLARE_ENV` | deploy scripts | selects staging vs prod build |
| `TEST_USER_TOKEN` | `middleware.ts`, test scripts | e2e identity cookie |
| `BUILD_ID`, `NEXT_PUBLIC_BUILD_ID`, `CF_PAGES_COMMIT_SHA`, `GITHUB_SHA` | build | version stamping |
| `MV_BASE`, `MV_SEED_JOURNAL`, `OUT`, `YB`, `RESET_PASSWORD` | `scripts/test/*` | test-harness inputs |
| `STORY`, `STORYBOOK_PORT`, `STORYBOOK_URL` | storybook | local UI dev |

(`AUTH_DISCORD_*` is the one secret bridged both ways: a Worker secret **and**
read via `process.env` by next-auth's provider config.)

## Local development

| File | Holds | Source of truth |
|---|---|---|
| `.dev.vars` | Worker secrets for `wrangler dev` (real values) | gitignored cache |
| `.env` | Next.js build/runtime secrets (real values) | gitignored |
| `.env.example` | Template (`AUTH_SECRET`, `AUTH_GOOGLE_*`) | committed, empty |
| `bridge/discord-dm/.env.example` | Bridge template | committed, empty |

`scripts/sync-dev-vars.mjs` copies only `AERODATABOX_API_KEY` from the shell
env (e.g. `~/.zshrc`) into `.dev.vars` — zshrc is the source of truth; wrangler
can't reference env vars from `.dev.vars`, it reads literal values only.

Both `.env` and `.dev.vars` are gitignored (`.gitignore` lines 41–42). `.env`
additionally carries `PAYLOAD_SECRET` (no code refs — legacy, likely dead).

## CI / CD secrets (GitHub Actions)

| Secret | Used by | Purpose |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `deploy-staging.yml`, `deploy-production.yml` | wrangler deploy auth |
| `CLOUDFLARE_ACCOUNT_ID` | both deploy workflows | account targeting |
| `STAGING_ADMIN_TOKEN` | `mirror-staging.yml` | Bearer for `/api/admin/ledger/mirror` |

- **Staging** deploys on push to `main` (auto) — no approval gate.
- **Production** deploys on `workflow_dispatch` and is gated by the GitHub
  `production` **environment** with a required reviewer (the owner). Both
  workflows also deploy the email worker for that env.

## OCI Discord bridge (off-Cloudflare)

`/opt/discord-dm/.env` on the OCI box (gitignored equivalent — never committed):

| Key | Purpose |
|---|---|
| `DISCORD_BOT_TOKEN` | bot Gateway login — **lives only here**, never in Cloudflare |
| `MILESVAULT_DM_URL` | which worker to POST to (prod) — the staging/prod switch |
| `DISCORD_BRIDGE_SECRET` | matches the Worker secret; the trust boundary |

## Findings / follow-ups

1. **`ALLOWED_EMAILS` is set on staging but NOT prod.** It backs the owner gate
   (`__ownerKey` in `inject-do.mjs`, and `membership.ts`). The owner gate is
   fail-closed (empty allowlist ⇒ all owner-only actions 403), so this is safe
   but means owner-gated admin actions can't run on prod. Confirm whether prod
   should have it (or whether prod intentionally relies on Flagship instead).
2. **Likely-dead secrets** — no code references found: `CF_AIG_TOKEN` (both
   envs), `AI_GATEWAY_NAME` + `CHAT_MODEL` (staging), `PAYLOAD_SECRET` (`.env`).
   Verify, then prune (ties into hygiene task #36). Don't assume — grep once
   more before deleting, in case of dynamic access.
3. **`LINEAR_LABEL_ID`** is read but unset everywhere — confirm it's optional.
4. **Shared-secret rotation** (#36): `DISCORD_BRIDGE_SECRET`, the WhatsApp
   token/app-secret, and the Discord bot token were all handled in plaintext
   during setup — rotate and confirm they're only in the stores above.
5. **`ENABLE_HYDRATE`** (staging var) has no code reference — verify it's still
   consumed by the build, else drop it.
6. **Single shared `D1`** across prod + staging — fine today (routing maps
   only), but worth keeping in mind: a bad write hits both environments.
