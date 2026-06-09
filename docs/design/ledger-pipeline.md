# MilesVault — Ingestion & Reconciliation Pipeline (design)

Status: **design only — architecture DECIDED, implementation not started.**
Greenfield (nothing in production), so foundational decisions are *made here*,
not deferred or authorization-gated. Build sequence lives in `delivery-plan.md`.

---

## 1. Diagnosis

The app today models the **read side**: a clean double-entry account tree plus
dashboards. That is the *output* of bookkeeping. Everything painful — upload a
PDF, paste a txn, email-ingested txns, reconciliation, invoice attach — is the
*machinery that produces it*, and has no representation. The fix is a missing
**spine: the lifecycle of a transaction, captured → reconciled.** Dashboards are
the terminus, not a sibling; "dashboards is the easy bit" is the symptom.

## 2. Dominant object: the capture item

Dominant object moves from **account** to the **capture item** — something that
arrived from a source and is in a state:

```
captured ──▶ extracting ──▶ extracted ──┬─▶ auto_posted ─▶ (posted, append-only)
                                         └─▶ needs_review ─▶ matched ─▶ posted
                                                          └─▶ dismissed
```

`source ∈ {upload, paste, email, invoice}`. Each transition is an event (§9).

## 3. Information architecture

Three zones on one spine; NavRail reads top-to-bottom as the lifecycle:

- **Capture** — always-on primary action: PDF, paste, per-ledger forwarding
  address.
- **Reconcile** — the workbench. *This is the product.*
- **Browse / Analyze** — the *result*: accounts tree + dashboards, reused as the
  projection UI (§9), demoted from front door to terminus.

Front door is the **Inbox** (a view over capture/event state, §9 — not the old
heuristic-over-entries idea, which was a no-production crutch and is dropped).

## 4. Trust contract (decided)

Two deliberately asymmetric paths:

1. **Ingestion auto-post (append-only).** Trusted sources — a forwarded txn
   email, parsed bank-statement lines — over a confidence threshold post
   immediately as **immutable appended events**, never silently editable, shown
   in a visible "recently auto-posted" lane.
2. **UI-initiated change (confirmation flow).** Any change started in the
   interface — recoding, split, correction, delete, dismiss — goes through an
   explicit confirmation step.

**Trusted-source gate.** A forwarded email qualifies for path 1 *only if* it
passes email auth (SPF/DKIM/DMARC/ARC, surfaced by Cloudflare via headers)
**and** envelope-from matches the user's registered forwarding address. Anything
failing → `needs_review`, never `auto_posted`. Email is spoofable and the token
is a bearer secret; this gate is what makes append-only auto-post safe.

Invariant: **a posted entry is never mutated.** A correction is a new appended
reversing/adjusting event referencing the original. This *is* the event log and
*is* the audit trail — the concrete reason the ledger is append-only.

## 5. Capture sources & email ingestion

- **Manual entry** — double-entry-aware form; emits posting events.
- **Paste / PDF upload** — raw artifact → R2; extraction → `needs_review`.
- **Email (forwarding only — decided)** — each ledger has a unique address
  `ingest+<high-entropy-token>@milesvault.com`; a forwarded txn email is a
  trusted source → `auto_posted` (append-only) subject to the §4 gate. No
  Gmail/OAuth scanning.
- **Invoice** — see §7; capture item whose document is *retained*.

Routing architecture (Cloudflare Email Routing + Email Workers, docs-confirmed):

- One **custom address `ingest@milesvault.com` → one Email Worker**.
  Plus-addressing means a *single* routing rule serves `ingest+<anytoken>@…` for
  unbounded tokens; **zero** per-ledger rules, so the 200-rule/200-address
  account limits never bind. (Raw catch-all → Worker is the fallback if bare
  `<token>@…` is ever wanted, but it makes the Worker the domain spam sink.)
- The Email Worker reads the `ForwardableEmailMessage` (`from`, `to`, `headers`,
  `raw` MIME, `rawSize`), parses MIME (e.g. `postal-mime`), validates the
  `+token`, **rejects unknown tokens** (`setReject()`), runs the §4 gate, then
  resolves `token → (user, ledger)` and invokes **that user's single
  `LedgerDO`** with the `ledger_id` (§8).
- Caveats: **25 MiB** whole-message cap (~18 MB attachment after base64) — guard
  oversized scans; Worker-handled mail shows as **"dropped"** in the CF
  dashboard even on success (monitor in-app); Email Routing can't reliably
  send/reply from the domain — acks need a separate transactional sender.

## 6. Reconciliation workbench (highest risk)

Two panes: left = rendered source (PDF/email/paste) with extracted fields
highlighted to origin; right = proposed double-entry lines, editable coding,
running balance. Must support match candidates (AI-ranked, confirm/reject/
manual), split (one source → many entries), merge/dedupe (same txn via multiple
sources collapses to one; all artifacts kept as evidence), and per-account
reconciled-through ("reconciled to DATE, N pending"). All actions are UI-
initiated → confirmation → confirmed events. Budget ~3× dashboards.

## 7. Invoices

Not a silo: a capture item whose document is *retained as a permanent
attachment* and may also be the *source* of extracted entries. **Consuming** =
AI reads → proposes → confirm. **Attaching** = link the retained doc to one or
more entries as evidence; both directions (one invoice → many entries; one entry
→ many docs).

## 8. Ledger topology — DECIDED

**One `LedgerDO` per *user*. Multiple books/ledgers live inside it as a
`ledger_id` namespace on every table.** Not DO-per-ledger.

Rationale: unified cross-ledger net worth is a **core product promise** (your
call). That figure must be a single transactional aggregate over all the user's
books — cheap and consistent inside one DO; a fan-out with cross-DO consistency
problems if split per ledger.

Consequences (mostly upside): email routing has one DO target per user; per-user
export and account deletion are trivial; the consolidated view is a local query.

Honest trade-off (the cost we're accepting): a user's books share **one storage
+ one single-threaded execution lane**; a pathologically heavy user can't be
sharded across DOs, and DO SQLite has size ceilings. Mitigations: personal-
finance scale is small, events are compact, blobs live in R2 not the DO. The
*only* scenario that would force revisiting is a single user outgrowing one DO —
at which point consolidation becomes a fan-out, an accepted, documented trade.

Open sub-problem: a consolidated net-worth figure across **multi-currency**
books needs a valuation policy (rate source, as-of date). Tracked in §11; it's
part of the promise and must not be hand-waved.

## 9. Event model — DECIDED

**Append-only event log per user (scoped by `ledger_id`) is the source of
truth. `ledger-core`/beancount becomes a projection rebuilt from it** —
re-founded, not rewritten; the accounts tree and heatmap survive as projection
UI.

- Event kinds: `captured`, `extracted`, `posted`, `corrected` (reversing),
  `dismissed`, `reconciled`. Versioned schema from day one.
- Posted ledger state, balances, journal, heatmap data = **projections**,
  rebuildable by replay. Never the source of truth.
- Corrections never mutate; they append reversing events referencing the
  original — this realizes the §4 invariant directly.

Cost, stated honestly: full event sourcing adds projection-rebuild and
event-versioning complexity. We pay it because the trust contract (money + AI
auto-post + append-only audit trail) is genuinely core — that's exactly when
event sourcing earns its keep. Kept lean by keeping the event schema small and
treating projections as disposable/rebuildable.

## 10. Data shapes (decided)

All tables carry `ledger_id`; the DO is per-user.

- `event_log` — id, ledger_id, kind, payload, actor (ai|user|email), created_at;
  append-only, the spine.
- `capture_item` / `extraction` — represented as events (`captured`,
  `extracted`); extraction re-runs append, never overwrite.
- raw artifact — **R2** blob (PDF/email/paste); opaque, immutable; DO stores
  only the ref.
- projection tables — accounts, balances, journal, heatmap aggregates;
  derived, rebuildable.
- `attachment_link` — artifact ↔ entry, role ∈ {source, evidence}.

## 11. Risks & open questions

- Reconciliation UX is the dominant risk — prototype before committing.
- Cross-source dedupe is hard (no shared id; fuzzy on amount/date/merchant).
- AI extraction confidence threshold for auto-post — concrete policy needed; a
  wrong auto-post is costly. Mitigation: visible auto-posted lane + one-gesture
  reversing correction.
- **Multi-currency consolidated net worth** (§8): valuation policy + rate source
  + as-of semantics. Open; part of the core promise.
- Single-DO-per-user size/throughput ceiling (§8): watch-item, not a blocker at
  personal-finance scale.

## 12. Phasing

Greenfield foundation-first, detailed in `delivery-plan.md`: F0 decisions
(this) → F1 event core + projection → F2 capture + blobs → F3 email ingestion →
F4 reconciliation → F5 multi-ledger + consolidated net worth. The IA spine (§3)
is not a separate "reskin phase" — it emerges as F1–F5 land on the real model.
