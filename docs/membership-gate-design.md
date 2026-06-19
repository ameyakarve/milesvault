# Membership gate — login restricted to YouTube channel members

Status: **BUILT, gate OFF by default.** `MEMBERSHIP_GATE` is the single enforcement
knob: OFF → **everyone who signs in is allowed**; ON → **members only** (+ ALLOWED_EMAILS
as the always-in safety hatch). `youtube.readonly` is requested at login **regardless of
the flag**, and every login **resolves + logs** the signer's channelId/title and whether
they're a member (`[membership] signin` log line) — the path runs always; only the
final allow/deny decision is flag-controlled. `checkNow` no-ops cheaply until the creator
token is bootstrapped, so pre-launch this costs ~nothing. Goal: gate app login to **members of
the owner's YouTube channel** — a new member gets **instant** access; removing access
may **lag (buffered)**, which is acceptable.

> Note: because `youtube.readonly` is always requested, login shows a YouTube-access
> consent and is capped to ~100 users until Google verifies the sensitive scope —
> this applies even while the gate is OFF.

## What's built (files)

- `src/durable/membership-do.ts` — the singleton `MembershipDO` (roster + cursor +
  creator token + units counter; `connectCreator`/`checkNow`/`isMember`/`status`,
  `syncUpdates`/`syncFull`, 60s self-rescheduling `alarm`, `poke`).
- `src/lib/membership.ts` — `membershipStub` (idFromName `'global'`), `allowedEmails`,
  `ownerEmail` (= first ALLOWED_EMAILS entry), `membershipGateEnabled`.
- `src/auth.ts` `signIn` — the gate: OFF → allow everyone; ON → members only with
  ALLOWED_EMAILS as the safety hatch. `src/auth.config.ts` always requests
  `youtube.readonly`.
- `src/app/api/admin/youtube/{connect,callback,status}/route.ts` — owner-only creator
  OAuth bootstrap + debug.
- `scripts/inject-do.mjs` (export + daily cron `poke`), `wrangler.jsonc` (binding +
  migration `v5`, both envs), `cloudflare-env.d.ts`.

## Bootstrap & enable (owner, per env)

1. **Add owner to the allowlist** (safety hatch so you can never be locked out):
   ensure your email is in `ALLOWED_EMAILS` for the env (staging already has it; add
   it to prod's vars before enabling the gate there).
2. **Google Cloud Console** (one-time): on the OAuth client, add Authorized redirect
   URIs `https://staging.milesvault.com/api/admin/youtube/callback` and
   `https://milesvault.com/api/admin/youtube/callback`. The user-login consent screen
   already requests `youtube.readonly` (sensitive — needs Google verification for
   >~100 users); the bootstrap adds `youtube.channel-memberships.creator`.
3. **Connect the creator token**: signed in as the owner, visit
   `/api/admin/youtube/connect` → consent. The callback stores the refresh token,
   seeds the roster, and starts the 60s poll. Check `/api/admin/youtube/status`.
4. **Enable enforcement**: set the var `MEMBERSHIP_GATE="1"` for that env and deploy.
   Until then login is unchanged.

## Auth model

- "Login with YouTube" is **Google OAuth** — a YouTube account *is* a Google account.
  A "Connect with YouTube" button is just Google OAuth requesting a YouTube **scope**;
  the consent screen then shows YouTube-account access. Same protocol as today's login.
- We add the YouTube scope so we can read the signed-in user's **channelId**
  (`channels.list?mine=true`). The gate matches that channelId against the channel's
  member list.
- **Identity stays email-keyed** (LedgerDO / ingest_tokens / ChatDO unchanged). Login
  captures **email (identity) + channelId (gate)**.

## Hard API realities (verified)

- `members.list` is **creator-only** — lists *your own* channel's members; a user
  cannot self-prove membership. Returns the member's **channelId, not email**. Scope
  `youtube.channel-memberships.creator`. Cost **2 units/call**, up to **1000
  members/page**, paginated. `mode=updates` (joins/upgrades since cursor) | `all_current`.
- **No membership webhook/callback.** PubSubHubbub pushes **video** events only;
  live-chat new-member events exist only **during a live broadcast**. So membership is
  **pull-only** — polling is the only option.
- `channels.list` ≈ **1 unit**. Daily quota **10,000 units** (extendable).
- **Sensitive-scope OAuth verification** required for production (`youtube.readonly` /
  `channel-memberships.creator`): Google review + demo video; until verified, ~**100
  test users**. This — not quota — is the main adoption gate.

## Architecture: a singleton membership Durable Object

One DO owns everything (and its **single-threadedness is the concurrency primitive**):
- the **member set** (channelIds) in SQLite — O(1) point lookups,
- the **`updates` cursor** (pageToken),
- the **owner creator-token** (one-time owner OAuth),
- a **`unitsToday` counter** (reset at UTC midnight) across all `members.list` calls.

Only this DO calls `members.list`, so the cursor never races.

## Refresh paths

| path | API | cadence | daily units |
|---|---|---|---|
| Fast grants | `mode=updates` | **every 60s** (fixed floor) | 1440×2 = **2,880** |
| Removals + ground truth + cursor self-heal | `mode=all_current` | **once daily** (= removal buffer ≤24h, acceptable) | M=10k ≈ **20**/day; M=50k ≈ **100**/day |
| On-login instant | poke the DO → immediate `updates` cycle | **only on cache miss**, coalesced + quota-gated | bounded (see below) |
| per-new-user | `channels.list?mine=true` | **once per user** (cache channelId) | ~1 each, negligible |

There is **one `syncUpdates()`** op (advance cursor, update set), triggered by both the
60s alarm and on-login pokes — a poke is just an early trigger of the same sync.

## On-login instant — discretionary, coalesced, quota-gated

`checkNow(channelId)` in the DO:
1. in set → **allow** (0 units).
2. synced <~5s ago → re-read set, allow/deny (0 units, debounce).
3. else if `unitsToday + 2 ≤ POKE_CEILING` → run/await `syncUpdates()` (coalesced via an
   **in-flight promise** — N concurrent misses await one poll), re-check.
4. else (**budget tight**) → **defer**: serve from cache (deny-for-now); the 60s poll
   grants within ≤60s. Negative-cache the miss ~10 min.

`POKE_CEILING` (~9,000) sits below the 10k cap so the fixed paths (60s updates + full
refresh) are always funded; pokes consume only headroom. Coalescing means **logins do
NOT map 1:1 to API calls** — a login spike collapses into one poll, so no thundering
herd and no quota blowout.

Behaviour: members in within ≤60s; a just-joined member hitting login → one poke →
instant; quota-stressed day → pokes degrade to "wait for the 60s poll"; removals pruned
by the slower `all_current`.

Knobs: `updates=60s`, `full=daily`, `debounce≈5s`, `POKE_CEILING≈9000`, `neg_cache≈10min`.

## Quota budget (fits 10k/day with headroom)

```
daily ≈ (86400/updates_s)×2 + ceil(M/1000)×2 [one daily full] + pokes×2 + new_users
```
M=10k, updates@60s + full@daily ≈ 2,880 + 20 ≈ **2,900 fixed** → ~6,100 units of poke
headroom under 10k. M=50k ≈ 2,980 fixed. Comfortably inside the **free 10k/day** — no
quota extension needed. (The 60s updates poll is essentially the entire budget; the
daily full refresh is a rounding error.)

## Cost of running the DO "forever" (Cloudflare $)

Key fact: a **scheduled alarm does NOT block hibernation** (only pending `fetch()`,
`setTimeout`, or a standard WebSocket do). So the 60s-alarm DO is **not billed 24/7** —
it sleeps ~49s of every 60s and bills only each alarm's brief active time.

- **Duration:** ~0.5s active per 60s poll (the `members.list` round-trip) × 1,440/day ×
  30 = ~21,600 s/mo × 0.125 GB = **~2,700 GB-s/month**. That's **<1% of the 400,000
  GB-s/month included** → ~$0 incremental (≈$0.03/mo at full marginal $12.50/M GB-s).
  Even the **worst case — the DO never sleeps, billed 24/7** — is ~324,000 GB-s/mo,
  which is **still inside** the 400,000 GB-s/mo free allowance (it would just eat most
  of it, leaving little for the per-user DOs). With hibernation between alarms it's
  ~2,700 GB-s/mo, leaving the allowance essentially untouched. Either way: **free.**
- **Requests:** ~43k alarm wakes/mo + logins, well under the **1,000,000/mo included** →
  ~$0 (≈$0.01/mo marginal).
- **SQLite:** point lookups for `isMember` (cheap). **Full refresh must DIFF** (write
  only added/removed rows), NOT rewrite the whole set — rewriting 50k rows hourly would
  cost ~$36/mo in row-writes ($1/M). Diffed: pennies. Storage of the set (≤~1.5 MB) is
  negligible.

**Net: effectively free** — within the included DO allowances; pennies/month even at
marginal pricing. The only cost trap is rewriting the whole member set on each full
refresh; diff instead. The real "budget" to respect is the **YouTube quota** (10k
units/day), which the cadences above already fit.

## Open decisions (before building)

1. **Membership source:** YouTube channel memberships, or **Patreon/Stripe** (member-by-
   email, tiers, webhooks — far less friction, cleaner for app-gating)? Biggest fork.
2. **Verification timing:** OK to start in test mode (~100 users) and do Google
   sensitive-scope verification later, or need scale day one?
3. **Full-refresh interval** = the removal buffer (30 min? 1 h?).
4. Confirm **memberships are enabled** on the channel (YouTube Partner Program).
5. Identity stays **email-keyed**; channelId used only for the gate — confirm.
