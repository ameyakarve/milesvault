# F1 — Implementation Plan (event core + projection + Vault home)

Status: **superseded (2026-06-10).** The event log this plan was built
around was implemented and then removed (`ledger-pipeline.md` §9 reversal):
the journal is the single source of truth and no event machinery remains.
What survives from this plan, all shipped: the Vault home + nav spine (§5),
journal provenance deep-links, and `capture_items` + the Inbox (as a plain
table, no events). Kept for the record. Originally: executes slice F1 of
`delivery-plan.md` on the shapes decided in `ledger-pipeline.md` §13 (F0.1). Companion to `experience.md`
(Vault home, §6; nav spine, §4).

## 0. What F1 must end with

Every write is an appended event in `event_log`; every table `ledger-core`
owns today (`transactions`, `postings`, directives, balance materializations)
is a projection rebuilt by replay; manual capture emits events; the nav spine
ships with Vault home v1 as the Browse surface. No AI changes, no blobs, no
email (F2/F3's "must not").

## 1. Current write paths → event emission

Everything funnels through `LedgerDO.replaceBuffer` today. The mapping:

| Today | F1 |
|---|---|
| `commit_journal_edit` (AI draft → user Approve) | append `posted` (`route: 'confirmed'`, `actor: 'ai'` + `actor_detail`), then project |
| `commit_ingest` (structured rows) | one `posted` per rendered batch, then project |
| `PUT /api/ledger/journal/batch` (Journal tab free edit, Cmd+S) | **diff-to-events** (§2), then project |
| `replaceBuffer` as a primitive | demoted to projector-internal; nothing outside the projector writes tables |

## 2. The free-edit problem (the only hard mapping)

The Journal tab edits the whole buffer; the event log wants entry-level
events. Bridge: parse old and new buffers (the strict parser already exists),
key entries by content hash (`transactions.hash` already exists), and diff:

- entry in new, not old → `posted` (route `confirmed`, actor `user`)
- entry in old, not new → `corrected` (reversing, reason `journal-edit`)
- entry changed → `corrected` referencing the original + `posted` for the new
  form, linked via `refs`

The editor UX does not change at all: same buffer, same Cmd+S, same OCC
(`knownIds` check stays as the conflict gate before diffing). The append-only
trust contract is preserved *under* a mutable-feeling surface — the journal
text is a projection; the log records edits as correction pairs.

Cost stated honestly: a heavy free edit produces a noisy correction trail.
Accepted — the Journal is power-user altitude (`experience.md` §11), the
Assistant/Inbox paths emit clean events, and a noisy-but-complete audit trail
beats a clean-but-lossy one.

## 3. Projector

The existing parse→insert pipeline *is* the projector; it changes owner, not
shape:

- `applyEvent(kind, v, payload)`: `posted`/`corrected` parse their embedded
  beancount text and insert/reverse into today's tables. Balance triggers stay
  (projection-internal). `captured`/`extracted`/`dismissed`/`reconciled`
  project into a `capture_items` view table (minimal in F1 — populated by
  manual capture only; F2 fills it out).
- `meta(projector_version)`: bump on any projector change; cold-start
  mismatch or failed `verify_balances()` → drop projection tables, replay all
  (`ledger-pipeline.md` §13.4 — no snapshots, ~2s escalation trigger).
- Purity invariant enforced by review: no clock, no network, no reads outside
  the log inside `applyEvent`.

## 4. Schema changes

- `event_log` exactly per §13.1, plus `ledger_id TEXT NOT NULL DEFAULT
  'main'` on every existing table (F5 multi-ledger readiness; single value
  through F4).
- `agent_proposals` stays (proposals are pre-commit state, not events;
  approving one emits `posted`).
- One-time bootstrap for existing (staging-only) data: synthesize one
  `posted` event per existing transaction/directive in date order, then
  rebuild — the log is complete from day one, no parallel legacy path.
  The bootstrap **clears and re-synthesizes** the log: any step-1 dual-write
  events are scaffolding for validating the emission path, not preserved
  history (acceptable on staging-only data; never again after bootstrap).

## 5. Vault home v1 (Browse)

Per `experience.md` §6, on existing projections — no new data work beyond F1
above:

- `/vault` route + nav spine rename (`Vault · Plan · Inbox · Journal`); Vault
  is the default landing; `/editor` journal tab becomes `/journal`, chat
  becomes the Assistant entry point (full merge is F2; F1 only re-labels).
- Tiles: holdings grouped by taxonomy kind (from `balance_totals` +
  `list_account_summaries`), points totals headline (no ₹ until valuation is
  decided), expiring soon (from `#reward-expiry`-tagged postings dated ahead),
  status counters. Every tile deep-links to the filtered Journal.
- Inbox nav item ships honest-empty (F2 fills it); needs-review/auto-posted
  lanes appear on Vault only when capture state exists.

## 6. Sequencing (PR-sized steps, main stays green)

1. **Log + append:** `event_log` + meta tables; all three commit paths
   dual-write (tables as today **and** append events). Pure addition, no
   behavior change.
2. **Projector + parity:** `applyEvent` + full replay + bootstrap synthesis;
   CI/staging check: replayed tables ≡ live tables (hash compare).
3. **Cutover:** writes go event-first (append → project); `replaceBuffer`
   becomes projector-internal; free edit switches to diff-to-events (§2).
4. **Vault home + spine:** §5. Pure frontend over projections.

Step 2's parity check is the safety net: cutover (3) only lands after replay
provably reproduces the live state on real staging data.

## 7. Out of scope (F1 "must not", restated)

No AI/agent changes, no R2 blobs, no email, no reconciliation, no
multi-ledger UX, no Assistant merge (F2), no rules/playground (F3.5).
