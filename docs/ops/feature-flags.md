# Feature flags — audit

Where feature flags are used today, and where they *should* be (gating that's
currently hardcoded or secret-presence-based). Backed by the Cloudflare
**Flagship** `FLAGS` binding; all reads go through `src/lib/flags.ts`.

Last audited: 2026-06-30.

## Mechanism

`env.FLAGS.getBooleanValue(name, default, ctx)` — Flagship evaluates dashboard
targeting rules against `ctx` (e.g. `{ email, environment }`) with no redeploy.
Two flags are defined in `src/lib/flags.ts`.

## Existing flags

| Flag | Eval default | Read by | Purpose | Status |
|---|---|---|---|---|
| `concierge_enabled` | **fail-CLOSED** (false) | `concierge-do.ts` (`beforeTurnFetch`), `inject-do.mjs` (Discord + WhatsApp), `api/flags/concierge`, `api/bot/pairing-code`, `concierge/page.tsx` | Gates the concierge across web + **all** messengers | **Live**, targeted admin-only (cohort rollout = #33) |
| `app_access` | **fail-OPEN** (true) | **nothing** | Intended login gate | ⚠️ **Defined but never called** |

### ⚠️ Finding: `app_access` is unwired

`appAccessAllowed` exists in `flags.ts`, and `membership.ts` comments that
"access is the Flagship `app_access`" — but **no code calls it**. The real login
gate is `auth.ts` `signIn`, which checks the **Discord member role**
(`DISCORD_MEMBER_ROLE_ID`, fail-closed). So the comment is misleading and the
flag is dead. **Decide:** either wire `app_access` into `auth.ts` (e.g. as an
owner override / staged-rollout knob alongside the role check) or delete the
dead function and fix the `membership.ts` comment.

## Gating that is NOT a flag today (candidates)

These are currently controlled by secret-presence, hardcoded constants, or env
branches — each is a candidate for a flag so it can be toggled without a deploy.

| # | Surface | Gated today by | Candidate flag | Why |
|---|---|---|---|---|
| 1 | **WhatsApp channel** | presence of 4 `WHATSAPP_*` secrets (`getMessengers` → `{}`) | `whatsapp_enabled` | Kill a channel without deleting secrets/redeploying |
| 2 | **Discord DM channel** | endpoint deployed + `concierge_enabled` only | `discord_dm_enabled` | Same — operational kill switch independent of the bridge |
| 3 | **Discord DM membership** | only `concierge_enabled` (no role check — #32) | (rollout gate) | DM path doesn't verify the member role like web login does |
| 4 | **Model selection** | hardcoded `@cf/google/gemma-4-26b-a4b-it` (concierge, editor, statement) | `model_id` (string flag) **or** AI-Gateway dynamic route (#39) | Toggle the model live |
| 5 | **Concierge cohort** | `concierge_enabled` targeting (admin-only) | — (targeting-rule change, #33) | Opening to members is dashboard-only, no code |
| 6 | **New-feature rollouts** | hardcoded on (gen-UI award options, reply buttons #35, statement ingest) | per-feature flags | Stage risky features behind a flag |

All three agent model ids are the same gemma build:
`@cf/google/gemma-4-26b-a4b-it` (`concierge.ts`, `editor.ts` ×2). The eval judge
uses `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (test-only).

## Recommendations

1. **Resolve `app_access`** — wire it or delete it; fix the `membership.ts`
   comment either way (highest priority — it's actively misleading).
2. **Per-channel kill switches** (`whatsapp_enabled`, `discord_dm_enabled`) —
   cheap operational safety: disable a channel instantly if it misbehaves,
   without touching secrets or redeploying. Read them where the channel enters
   (`getMessengers`, the `/api/discord/dm` handler) with **fail-CLOSED** defaults
   like `concierge_enabled`.
3. **Model toggle** — see #39: either a `model_id` string flag (simplest, keeps
   the existing model-call path) or an AI-Gateway dynamic route.
4. Keep `concierge_enabled` as the single cohort gate; the member rollout (#33)
   is a targeting-rule change, not code.
