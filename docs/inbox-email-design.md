# Inbox (email ingest) — design & plan

Status: design agreed, not yet built. This captures the decisions from the design
discussion so we can resume. "Inbox" = the forwarded-email capture surface
(`/inbox`, `source='email'`). The PDF-upload path already works end-to-end; this
doc is about making the **email** path work, cheaply and securely.

## Goal

A user forwards a transaction email to their personal forwarding address; it shows
up in the Inbox already drafted into balanced journal entries for review/approve —
reusing the exact abstractions the editor and statement-upload paths use.

## Architecture decisions (agreed)

- **Same abstraction as editor + statements.** Drafting runs on `ChatDO.runDraftStatement`
  via `this.modelInvocation(...)` — identical model build / token budget / repair hook.
  No new/parallel drafting code path.
- **Each email gets its own per-capture DO** (`ChatDO` keyed `email::<captureId>`),
  exactly like a statement upload. One email → one capture → one DO. (Secondary
  detail, but firm.)
- **Captures live on the DO.** `capture_items` rows in the per-user `LedgerDO`
  (`captured → processing → extracted`/error), drafts in `capture_items.drafts`.
- **No common storage of content.** Email content goes straight from the worker into
  the per-user `LedgerDO` + its per-email `ChatDO`. No D1/KV/R2 staging of bodies, no
  shared draft store. (We considered a D1 staging buffer + per-user encryption to make
  it zero-knowledge; **dropped** — unnecessary once we confirmed DO wakes are cheap, and
  it would mean shared content storage we don't want.)
- **Bijective user ↔ forwarding address (1:1 both ways).** One forwarding address per
  user, one user per address. Rotation **replaces** (delete-all + insert one), never
  adds a second; never shared across users.
- **Drop untrusted senders (allowlist, default-reject).** An unknown sender is dropped
  at the worker — nothing stored, nothing drafted. Only a vetted/trusted sender →
  capture + draft. (Flip today's default-capture/blocklist → default-drop/allowlist.)
  Reuses the existing per-user rules engine (`match_email_rule`, the Inbox Rules page).
- **Eager draft for trusted email** (like statements) — acceptable because the draft
  cost is gated behind the sender allowlist; spam never reaches the draft.

## Per-user forwarding address — where it's stored

Each user has exactly one forwarding address `ingest+<token>@milesvault.com`. The
`token → user email` mapping is the **`ingest_tokens` D1 table** (`{token, email,
created_at}`). This is the **one accepted shared table** — routing metadata only, no
transaction content (a raw inbound email carries only the address, so the worker must
resolve address → user somewhere shared before it can reach the right per-user DO).

- **Bijection (1:1 both ways), to enforce:** `token` is already PRIMARY KEY (one user
  per address ✓). `email` is currently only indexed, not UNIQUE — add **`UNIQUE` on
  `email`** so a user can hold at most one address (one address per user ✓). Rotation =
  delete-all-for-user + insert one.
- **Decision still open:** do we *also* mirror the address into the per-user `LedgerDO`
  (so the DO knows its own forwarding address, e.g. to show it / re-derive it), keeping
  D1 purely as the routing index? Default for now: D1 is the system of record;
  revisit if the DO needs to know its address. (TODO below.)

## Tracking pending work / "pending DOs"

There is **no global registry of DOs** — Cloudflare cannot enumerate DO instances. We
track pending work ourselves, **per user**:

- **Per-user list → `capture_items` in that user's `LedgerDO`.** The `state` column
  (`captured → processing → extracted` / error) is the pending tracker. Non-terminal
  rows (`captured`, `processing`) = drafts still pending; each maps **1:1 to a
  per-capture `ChatDO`** (`email::<captureId>`). "All pending for a user" = query that
  table.
- **Inside each per-capture `ChatDO` → the scheduled alarm.** `draftStatementAsync`
  does `this.schedule(0, 'runDraftStatement', id)`; the durable alarm is the per-DO
  "work pending" marker and survives eviction.
- **Recovery anchor:** a row stuck in `processing`/`captured` with no progress is a
  draft to re-kick — that's what the `redraft` action does.
- **No cross-user view:** pending is only visible per `LedgerDO`; there is no shared
  index across users (D1 `ingest_tokens` is routing only). Same for statements and email.

## Cost analysis (confirmed from Cloudflare docs)

Sources: [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[DO lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/).

Confirmed rates (Workers Paid):
- Requests: **$0.15 / 1M** ($0.00000015 each).
- Duration: **$12.50 / 1M GB-s**; DO billed at **128 MB = 0.125 GB** "regardless of
  actual usage". → **$0.0000015625 per DO active-second**.
- Free/month: **400,000 GB-s** + **1,000,000 requests**.
- Duration billed in **wall-clock while active / not hibernation-eligible**.

Lifecycle facts:
- Idle-but-**hibernation-eligible** = **not billed** (even before actually hibernated).
- Hibernation requires ALL: no `setTimeout`/`setInterval`, **no in-progress awaited
  `fetch()`**, no standard-API WebSocket, no request/event processing.
- After a request: hibernateable after ~10s inactivity (that idle window not billed);
  non-hibernateable sits 70–140s then evicts. No manual "sleep now" API.

Implications (the key reason for the design):
- **Landing an email is ~free**: a `put_statement` is a few ms of active time + 1 request.
  Waking the DO per email is NOT the cost.
- **The draft is the cost**: the awaited LLM `fetch()` blocks hibernation, so the DO is
  billed for the **entire** draft wall-clock. 100s draft = 12.5 GB-s = **$0.00015625**
  (DO duration only) **plus Workers AI inference** (rate not yet confirmed — likely the
  largest component; TODO to confirm).
- Free duration quota ≈ **32,000 drafts/month** (at 100s each) before any duration charge.
- Ratio: a 100s draft ≈ **~90×** a 1s landing.
- → The only real cost lever is **not drafting unwanted email** (the allowlist), not
  batching wakes. Batching wakes optimizes a ~free thing.

### Cost gotcha to verify
The live **DraftTrace WebSocket** (`useAgent`) must use Cloudflare's **WebSocket
Hibernation API**. A standard WebSocket blocks hibernation → the DO stays **billed the
whole time the user has the Inbox tab open**. TODO: confirm the Think/agents layer uses
hibernatable WebSockets.

## Flow (target)

1. Email → email worker. Resolve `forwarding-address → user` via `ingest_tokens`.
2. Worker → user's `LedgerDO`: **vet sender** (`match_email_rule`, allowlist). Untrusted → **drop** (reject; nothing stored).
3. Trusted → `put_statement` (capture row) **+** `draftStatementAsync(captureId)` on the per-email `ChatDO` → drafts via `modelInvocation` → `set_capture_drafts`.
4. Inbox reads `list_captures`; **Approve** writes entries to the ledger (`replaceBuffer`) and marks the capture consumed.

## Build plan (ordered)

1. **`ingest_tokens`: enforce bijection** — add `UNIQUE` on `email` (currently a plain
   index + `LIMIT 1`, so a race can mint two addresses per user). Make GET race-safe
   (get-or-create); rotate stays delete-then-insert.
2. **Email worker → allowlist-drop + per-email DO draft**:
   - Flip default to **drop** untrusted senders (allowlist via `match_email_rule`).
   - Add `CHAT_DO` cross-script binding to `workers/email`.
   - After `put_statement`, call `draftStatementAsync(id)` (the same two lines
     `/api/statements` runs) → per-email DO drafts.
3. **`read_statement` tool** — register it so the per-capture Inbox chat can read its
   email body (the thread system prompt already tells the agent to call it →
   currently `NoSuchToolError`).

## Open items / more to do (TBD — expand as we go)

- [ ] Confirm Workers AI **inference** cost (the unconfirmed, likely-dominant draft cost).
- [ ] Confirm the agents/Think **WebSocket uses the Hibernation API** (else idle-tab cost leak).
- [ ] How does a user **add/manage trusted senders** (allowlist) — reuse the Rules page UI?
      First-run bootstrapping (no rules yet ⇒ everything dropped) — onboarding flow?
- [ ] Read the **`email_rules` table schema** + how rules are authored (not yet inspected).
- [ ] Email body parsing quality (PostalMime text/html → body) — sufficient for drafting?
- [ ] Dedup / idempotency (same email forwarded twice).
- [ ] Approve-flow sequencing hardening (write-to-ledger then mark-posted; interrupt risk).
- [ ] Stale `LedgerClient` types (`list_captures` omits `drafts`/`draft_error`;
      `set_capture_state` omits `'processing'`); consider a `get_capture(id)` getter.

## Known-but-out-of-scope-for-now (separate threads)

- Statement eval residuals: Axis `all-amounts-exact` micro-fee long-tail; big-statement
  bookend variance. (Statements parked at ~4/5; "done enough" per owner.)
- Editor: Case-2 refund (empty turn / stalled non-draft tool call) still failing
  (19→20/21 after the points-accrual fix).
