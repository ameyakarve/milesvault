# MilesVault — Greenfield Delivery Plan

Status: **design only.** Companion to `ledger-pipeline.md` (the decided model).
Premise: nothing in production → no migration tax, no de-risking reskin. We
build the *right* foundation directly, in vertical slices that are each
shippable and testable, never throwaway.

## Why not the old Phase 1

The previous "front-end-only IA reskin on existing data" existed solely to
validate the spine without touching architecture on a live system. There is no
live system. Building a stub over a data model we already know is wrong-centered
would be waste. Deleted. The IA spine is now the natural shape of F1–F5, not a
separate phase.

## Sequencing principle

Foundation-first, then outward along the spine. Each slice is vertical (data →
projection → UI) so it's demonstrable, and each builds the real thing decided in
`ledger-pipeline.md` — not a placeholder.

| Slice | Builds | Demonstrates |
|---|---|---|
| **F0** | This + `ledger-pipeline.md`: topology, event model, data shapes **decided** | The plan is coherent and the keystone calls are made |
| **F1** | Per-user `LedgerDO` with `ledger_id`-scoped **append-only event log**; `ledger-core` re-founded as a **projection** over it; manual-entry Capture emits events; Browse (accounts, journal, heatmap) reads projections | The real foundation: every write is an event, the read model is derived and rebuildable. Existing heatmap/accounts UI survives as projection UI |
| **F2** | R2 raw-artifact storage; `captured`/`extracted` events; paste + PDF upload → AI extraction → `needs_review`/`auto_posted` per §4 gate; **Inbox** as a real view over capture/event state | Capture is real; Inbox is a genuine workflow surface, not heuristics |
| **F3** | `ingest@` Email Worker + plus-token; `token → (user, ledger)` resolution; trusted-source gate; append into that user's DO | Forward an email → it lands, gated, append-only |
| **F4** | Reconciliation workbench: match candidates, split, merge/dedupe, reconciled-through — over the event/projection model | The product's hardest, highest-value surface |
| **F5** | Multi-ledger UX (switcher) + **consolidated cross-ledger net worth** — a local aggregate, cheap *by construction* because of the §8 topology choice | The core promise, delivered on a foundation built for it |

## IA spine ↔ slices

- **Capture** appears in F1 (manual entry) and becomes full in F2–F3.
- **Inbox** (front door) is real from F2 (capture/event state), not a stub.
- **Reconcile** route is honest-empty until F4, then the workbench.
- **Browse/Analyze** exists from F1 as projection UI (existing accounts +
  heatmap, re-founded on the event log).
- **Ledger context / switcher** is single-valued through F4; real in F5.

## What each slice must NOT do

- F1: no AI, no blobs, no email — just events + projection + manual entry.
- F2: no email worker, no reconciliation — capture + extraction + Inbox only.
- F3: no reconciliation — ingestion + gate only.
- F4: no multi-ledger UX — single ledger reconciliation.
- F5: no new ingestion surfaces — UX + consolidation projection only.

Keeps each slice provable and prevents the scope-bleed that would turn "do the
right thing from all angles" into an unbounded rebuild.

## Foundational decisions locked (from `ledger-pipeline.md`)

- **Topology:** one `LedgerDO` per user; books as `ledger_id` namespace (§8).
- ~~**Source of truth:** append-only event log; `ledger-core` is a projection
  (§9).~~ **Reversed 2026-06-10** (`ledger-pipeline.md` §9): the beancount
  journal is the single source of truth. The §4 invariant stands as reversing
  *journal entries*; capture state is a plain table.
- **Email:** forwarding-only, single `ingest@` rule + plus-token, §4 gate (§5).
- **Raw docs/invoices:** R2 blobs, DO holds refs only (§10).

## Open before F1 finalizes

- ~~Event schema v1 / projection rebuild strategy~~ — moot after the §9
  reversal (no event log).
- Multi-currency consolidated-net-worth valuation policy (rate source, as-of) —
  needed before F5, decided no later than F4.

## Acceptance per slice (summary)

Each slice ships with: the decided data shapes (no shortcut schemas), working
empty/loading/error states, balances rebuildable from the journal, and no
scope-bleed into the next slice's "must not." F0's acceptance is simply: these
two docs are internally consistent and the keystone decisions are unambiguous.
