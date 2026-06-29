# Discord identity & auth cutover

## Status

Planned. Prerequisite for the WhatsApp/messengers work (`feat/whatsapp-messenger`),
which keys the concierge by the user's primary id — so this lands first, on its
own branch (`feat/discord-identity`) and PR.

## Motivation

MilesVault's access is gated on a YouTube-channel membership, which is verified
through a **role in the owner's Discord server**. Google sign-in is not an
option for this audience. Every user therefore authenticates via Discord, so the
**Discord snowflake user id** is the natural primary identity.

The snowflake is also a strictly better primary key than the email we use today:

| Property | Email (Google) | Discord snowflake |
| --- | --- | --- |
| Mutable | yes (users change it) | **never** |
| Always present | yes (Google) | **yes** (`identify` scope) |
| Unique / non-reassigned | mostly | **guaranteed** |

Discord's own `email` field is `?string` — optional **and** nullable (phone
signups, unset, or scope declined) — so we never key on it. Email becomes an
optional *attribute*, not identity.

## Decisions (locked)

1. **Primary key** = Discord snowflake (`uid`, stored as a string).
2. **Auth provider** = Discord (replaces Google). Scopes: `identify` +
   `guilds.members.read` (+ `email` opportunistically, as an attribute).
3. **Access gate** = the existing YouTube-membership **role** in the owner's
   guild. **Hard gate**: no role → no login. Ledger data is retained
   server-side but inaccessible until the role returns. No grace window.
4. **Migration** = approach **A (alias rows), run offline before any login.**
   No Durable Object data is moved.
5. Email-ingest forwarding, ledger model, agents, KG, and the LLM-first ingest
   pipeline are **unchanged** — this is purely identity / auth / routing.

## The key that shrinks the migration

Of the per-user Durable Objects, only **`LEDGER_DO`** holds durable data worth
preserving. `ChatDO` (draft/conversation scratch) and `ConciergeDO` (ephemeral
Q&A) can start fresh per user. So the migration only has to keep each user's
**ledger** reachable — and it does that without copying any DO data, via one
indirection table.

```
user_keys
  uid          TEXT PRIMARY KEY   -- Discord snowflake (the new identity)
  storage_key  TEXT NOT NULL      -- the LEDGER_DO / CHAT_DO instance name
  email        TEXT               -- attribute: ingest-forwarding display, comms
  created_at   INTEGER NOT NULL
```

- **New users**: `storage_key = uid` (the snowflake itself).
- **Legacy 30 users**: `storage_key = <their old email>` — so their existing
  `LedgerDO(email)` is found unchanged.

All DO routing becomes: authenticated `uid` → `user_keys.storage_key` →
`LEDGER_DO.idFromName(storage_key)`. To avoid a D1 read per agent request, the
auth callback resolves `uid → storage_key` **once at login** and stamps `sk`
into the next-auth JWT; the worker wrapper reads `token.sk` directly.

**Why the alias instead of a clean re-key (approach B):** we want a users table
anyway (snowflake, email attribute, membership status, created_at). Once it
exists, a `storage_key` column is near-zero extra complexity and lets us skip a
risky bulk copy of 30 `LedgerDO` SQLite stores. We can collapse to
snowflake-only keys later if ever desired.

**Bonus:** legacy `ingest_tokens` and `bot_links` rows already map to *email* —
which is exactly the legacy `storage_key`. So **email-ingest and existing
pairings keep working untouched**; only new users get snowflake storage keys.

## Changes by area

### Auth (`src/auth.ts`, `src/auth.config.ts`)

- Drop the Google provider; add the next-auth **Discord** provider.
- Scopes: `identify`, `guilds.members.read`, optionally `email`.
- `signIn` / `jwt` callback:
  - `uid = profile.id`.
  - **Membership gate**: `GET /users/@me/guilds/{GUILD_ID}/member` with the
    OAuth user token → assert the membership role id is in `member.roles[]`.
    Not a member → deny sign-in (→ "join the membership" page).
  - Resolve (do not create at login for legacy — see migration) the `user_keys`
    row; set `token.uid`, `token.sk`, `session.user.id = uid`.
- Downstream code no longer assumes a session email; it uses `uid` / `sk`.

### Routing (`scripts/inject-do.mjs`)

- `__resolveEmail` → `__resolveUserId`: read `token.sk` from the next-auth JWT
  instead of the email. Everything else (per-product binding map, WebSocket
  upgrade handling) is unchanged.
- The e2e test-identity path (`TEST_USER_TOKEN` → fixed test key) is preserved,
  so the eval suites keep working with no change.

### Tables

- Add `user_keys` (above).
- `ingest_tokens`: semantics shift from "maps to email" to "maps to
  storage_key" — legacy rows are already valid (storage_key == email).
- `bot_links` (messenger pairing): channel id → storage_key (legacy rows valid).
- Flags / admin allowlist (`conciergeEnabled`): re-key from email to `uid`
  (the owner needs their own snowflake whitelisted + the membership role, or an
  explicit owner override).

### One-shot offline migration (the 30, manual correlation)

1. **Dump the roster** — admin script using the **bot token** +
   `GET /guilds/{id}/members` (requires the **`GUILD_MEMBERS` privileged
   intent** enabled and the bot present in the guild) →
   `{ snowflake, username, has_membership_role }`.
2. **Owner correlates** email → snowflake by recognizing handles → a 30-row map.
3. **Seed `user_keys`** offline: insert
   `(uid = snowflake, storage_key = email, email = email)` per row. Idempotent.
   Their ledger is now reachable from their Discord login. **Zero data moved.**
4. Runs **before launch / before any login** — login is then a pure lookup.
   An unmapped Discord login simply starts a fresh snowflake-keyed account; it
   can be aliased later by re-running the seed for that user.

## Sequencing

1. **This refactor** (auth swap, snowflake identity, `user_keys`, membership
   gate, offline migration) — verified by the editor + concierge eval suites
   (test-identity path untouched).
2. **Then WhatsApp/messengers** keyed by snowflake: pairing maps
   `wa_id → uid`; the concierge sub-agent reads `LEDGER_DO` via `storage_key`.
3. **Discord-as-a-messaging-channel** later needs **no pairing** — a Discord DM
   event carries `author.id` = `uid` = the primary key directly.

## Risks / call-outs

- **Hard-gate lockout** (chosen): losing the role ⇒ losing ledger access until
  it returns. Intended for a membership product; data is retained, not deleted.
- **Single provider**: a Discord outage means no login. Acceptable for a
  Discord-gated product.
- **Privileged intent + bot-in-guild** required for the roster dump — a one-time
  Discord developer-portal setting on the owner's side.
- **next-auth v5-beta Discord provider** config to confirm at build time, plus
  the exact shape of `GET /users/@me/guilds/{id}/member` and role-id retrieval.

## What explicitly does NOT change

The statement-ingest pipeline (LLM-first), the ledger data model, the
editor/concierge agents, and the `~/milesvault-kg` content. Identity, auth, and
routing only.

---

## As-built notes

- The Discord provider + the membership role hard-gate already existed (a prior
  cutover). The work here was the **email→snowflake re-key**: `signIn` no longer
  requires an email (gates on snowflake + role); a `jwt` callback stamps `uid`
  and the resolved `key`; `session.user.{id,key}` are exposed. Existing live
  sessions degrade gracefully — `session.user.key` falls back to the old email
  until the next login.
- The ~30 API routes + pages now key Durable Objects / flags by
  `session.user.key`. `settings` still shows the real (nullable) email.
- **Owner gating.** The temporary owner-only admin endpoints were **removed**
  (`/api/admin/migrate-rewards`, `/api/admin/youtube/{connect,callback,status}`).
  The only remaining owner gate is the `/api/admin/workflows/*` trigger in
  `inject-do.mjs` (manual run of the live daily `refresh-magnify` workflow),
  gated by `key === ALLOWED_EMAILS[0]` (the owner's storage key is their email).

## Migration runbook

Runs **offline, before login**, out-of-band via `wrangler d1 execute` (so it
needs no in-app auth — avoiding the owner-gate bootstrap deadlock). Staging and
production share one D1, so a single apply covers both.

```sh
# 1. (optional) dump the guild roster to correlate emails → snowflakes.
#    Needs a bot in the guild with the GUILD_MEMBERS privileged intent.
DISCORD_BOT_TOKEN=xxx DISCORD_GUILD_ID=123 DISCORD_MEMBER_ROLE_ID=456 \
  node scripts/migrate-identity.mjs roster > roster.tsv

# 2. hand-build map.csv with `email,uid` rows for the ~30 (include the OWNER,
#    so their storage_key stays their email and the workflows gate keeps working).

# 3. emit + review SQL, then apply.
node scripts/migrate-identity.mjs seed map.csv > seed.sql
npx wrangler d1 execute milesvault --remote --file seed.sql
```

New users are NOT seeded — they get `storage_key = uid` on first login via
`resolveStorageKey`.
