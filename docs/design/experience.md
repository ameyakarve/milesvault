# MilesVault — Experience North Star (design)

Status: **design only.** Companion to `ledger-pipeline.md` (decided data/trust
model) and `delivery-plan.md` (slices). Those docs decide the spine of the
*finance pipeline*; this doc decides what the whole product should **feel
like** — including the points/miles surfaces the pipeline docs don't cover —
and maps that feel onto the same F-slices. Where this doc amends a prior
decision, it says so explicitly (§5, landing rule).

## 1. One sentence

MilesVault should feel like a private banker for your points: you **glance** at
the Vault to know where you stand, you **drop** anything on the Assistant and it
files it, and the Plan surfaces tell you what your points are worth in real
trips. The journal is the receipt, not the front door.

Feel test for every session: **glance → know · drop → done · ask → plan.** If a
session can't be described by one of those verb pairs, the surface that hosted
it is mis-designed.

## 2. Unit pieces (what exists today)

| Piece | Where | What it is for the user |
|---|---|---|
| Beancount ledger + taxonomy | `LedgerDO`, `ledger-core` | Source of truth: cards, wallets, `Assets:Rewards:Points:*`, `Assets:Rewards:Status:*`, semantic tags |
| Journal editor | `/editor` Journal tab | Raw plain-text view/edit, filters, Cmd+S |
| Drafting chat | `/editor` Chat tab | NL → `draft_transaction` cards → approve/reject; PDF statement upload → specialist handoff |
| Concierge chat | `/concierge` | Q&A over the knowledge graph (cards, programmes, ratios, alliances) + read-only ledger analyst |
| Award Explorer | `/explore` | O&D → every programme's award price, flight globe, transfer path |
| Points graph | `/points` (unlisted) | Every path to a target currency, overlaid with held balances |
| Status Match graph | `/status-match` | Match merry-go-round between elite tiers |
| Trust contract | everywhere | AI proposes, user commits; posted entries never mutate (`ledger-pipeline.md` §4) |

The atoms are strong. The molecule is tool-shaped.

## 3. Diagnosis

- **No answer screen.** The app lands on an empty code editor. "What do I
  have?" — the first question of any points user — has no surface. Balances
  exist only as journal text or graph overlays.
- **Two AI brains.** The user must know that `/editor` chat edits and
  `/concierge` chat answers. That is the agent registry leaking into the UX;
  the handoff machinery already exists to hide it.
- **Three disconnected graph tools.** Explore, Points, and Status Match are
  three views of one question ("what can my points become?") that barely know
  about each other or about the ledger. `/points` isn't even in the nav.
- **Capture is hidden.** The best ingestion UX in the product (draft→approve
  cards) lives inside one tab of one page.

## 4. The experience spine

NavRail reads as four honest words, with the Assistant floating over all of
them:

```
Vault · Plan · Inbox · Journal          [Assistant: persistent panel / Cmd+K]
```

Mapping to the decided pipeline IA (`ledger-pipeline.md` §3):

| Pipeline zone | Experience home |
|---|---|
| Capture | Not a place — an **action** available everywhere (drop target, Assistant, forwarding address). Its workflow state lives in the Inbox. |
| Inbox | **Inbox** — same object, capture-item lifecycle view (§2 of pipeline doc). |
| Reconcile | Lives **inside the Inbox zone** as the workbench (F4). It remains "the product" for the finance pipeline; it is not a separate nav word. |
| Browse / Analyze | **Vault** (balances, dashboards, per-account overview-tab contract) + **Journal** (raw projection, power-user altitude). |
| — (uncovered) | **Plan** — the points/miles planning zone: Explore, Points, Status Match unified. |

**Form factor: desktop-first, mobile-functional.** The experience is tuned for
desktop — graph canvases, the journal editor, the side-by-side Assistant panel
and the reconciliation workbench all assume width. Mobile must be *functional*,
not equivalent: every zone reachable (rail collapses to the existing top-bar +
sheet pattern), glance and drop fully work (Vault tiles stack single-column;
capture via share/upload + Assistant sheet; Inbox batch review is
thumb-friendly), and Plan degrades gracefully (results tables and list views
first-class, graph canvases pannable but not the primary mobile affordance).
Authoring-heavy surfaces — Journal editing, rule playground (§9),
reconciliation — may be desktop-only at first; on mobile they read, not write.

## 5. Landing rule — amendment

`ledger-pipeline.md` §3 says "front door is the Inbox." Amended: **the front
door is the Vault; the Inbox front-doors itself when it has work.**

- Default landing is the Vault home (§6).
- The Inbox nav item carries a count badge; the Vault home shows a "Needs
  review (N)" lane and the "recently auto-posted" lane required by the trust
  contract (§4 of pipeline doc).
- If the user arrives with pending `needs_review` items above a threshold (or
  followed an ingestion notification), land on the Inbox directly.

Rationale: Inbox-as-front-door is correct *when there is work*. With zero
pending items — most sessions, for most users — an empty workflow queue is a
worse first screen than the answer to "what do I have?" The pipeline doc's
real requirement (capture state is never buried) is preserved by the badge +
lanes.

## 6. Vault home (sketch)

Reuses the `overview-tab.md` primitives (KPI tiles, statement-row component);
the per-account drill-down **is** the overview-tab contract, unchanged.

```
┌──────────────────────────────────────────────────────────────────┐
│  POINTS NET WORTH        EXPIRING ≤90d      STATUS               │
│  ₹4.2L est. value        18,000 KrisFlyer   Marriott Gold 31/50  │
│  2.1M pts · 9 currencies  ⚠ 12 Aug          nights  ▓▓▓▓▓░░░     │
├──────────────────────────────────────────────────────────────────┤
│  NEEDS REVIEW (3)                          RECENTLY AUTO-POSTED  │
│  HDFC stmt Mar — 14 drafts   [Review →]    ✓ Amex txn email 2d   │
├──────────────────────────────────────────────────────────────────┤
│  HOLDINGS (by taxonomy group; each card → account overview tab)  │
│  ┌ Points ──────────────┐ ┌ Cards ───────────┐ ┌ Wallets ─────┐ │
│  │ MR        82,400  ↗  │ │ Amex Plat  -42k  │ │ Forex  $310  │ │
│  │ KrisFlyer 18,000  ⚠  │ │ HDFC Inf   -12k  │ │ ...          │ │
│  │ Avios     61,250     │ │ ...              │ └──────────────┘ │
│  └──────────────────────┘ └──────────────────┘                  │
├──────────────────────────────────────────────────────────────────┤
│  "With what you hold today" — 3 best award teasers → Plan        │
└──────────────────────────────────────────────────────────────────┘
   [Assistant panel: drop a PDF here, or ask anything]
```

Every number is clickable and resolves to the journal entries that produced
it — provenance is the trust feature, one tap away, never the landing page.
(Net-worth valuation policy is the open F4/F5 question in `delivery-plan.md`;
until decided, the headline tile shows points totals without ₹ estimate.)

## 7. One Assistant

Merge the two chat surfaces into a single omnipresent assistant (persistent
side panel on desktop, sheet on mobile, `Cmd+K` anywhere). Internally it is the
existing registries — `ledger`/`statement`/`graph-walker`/`analyst` — behind
one entry point; the user never picks a brain. Requirements:

- **Context injection.** The active screen's state (account in view, O&D pair,
  target currency) is part of the turn context. On a card's page, "log my
  March statement" needs no clarify round-trip; on Explore with BLR→NRT open,
  "can I afford this?" reads the screen.
- **Same trust contract.** Draft cards, clarify cards, approve/reject — all
  unchanged, just available everywhere.
- **Registry note:** this is a registry merge / router-agent addition in
  `agent-registries.md` terms — an experience decision, not an architecture
  change; DO topology stays as is.

## 8. Capture feels like forwarding, not filing

Fluidity test: *drag a PDF onto any screen, see a badge appear, approve a batch
in under ten seconds.*

- Global drop target (whole viewport, any route) → capture item → Inbox.
- Inbox badge in the nav; batch review with per-row toggles instead of
  one-card-at-a-time pagination.
- Email forwarding feeds the same Inbox — autonomously, with user-authored
  rules (§9).
- The approve gate stays sacred — but approving should feel like swiping, not
  like reviewing a PR.

## 9. Email ingestion — autonomous, with user-authored rules

The forwarding address and trust gate are already decided
(`ledger-pipeline.md` §5: `ingest+<token>@milesvault.com`, SPF/DKIM/DMARC +
envelope-from check). The experience layer on top: the user doesn't just
forward emails — they **teach the pipeline what to do with them**, then let it
run. Not a fundamental change: rules ride the existing capture-item lifecycle
and the §4 trust contract; they only shape the *extraction* step.

Three pieces, all living in the Inbox zone:

- **Rules.** A rule = a **matcher** (sender, subject pattern, attachment type)
  + a **prompt** the ingestion agent executes when the matcher fires — e.g.
  *"Amex statement mails: extract all transactions, fold forex fee + GST per
  the markup rule, tag `#cc-amex`."* Rules run autonomously on arrival.
  Outcome routing is unchanged: passes the trust gate and confidence threshold
  → `auto_posted` (append-only); anything else → `needs_review`. A rule can
  tighten routing (force review) but never loosen the gate.
- **Playground.** Dry-run surface for authoring: pick a past email from the
  log (or paste one), run a rule against it, see the exact draft cards it
  would produce — nothing commits. Editing a rule = iterate in the playground
  until the drafts look right, then enable. Same gen-UI cards as the chat, in
  rehearsal mode.
- **Log.** Every autonomous run is recorded and visible: which email arrived,
  which rule fired (or none), what was posted or queued, with links to the
  resulting capture items and journal entries. This is the Vault's
  "recently auto-posted" lane at full depth — the answer to "what did the
  robot do while I was away," one click from the Inbox.

Trust posture: the rule prompt is user-authored and trusted; the **email body
is untrusted input** and is treated as data, never as instructions — the
ingestion agent must be hardened against emails that try to steer it
(instruction-shaped text in a statement, a forwarded phish). Auto-posted
entries are never silently mutated; a bad rule run is corrected by reversing
journal entries, so autonomy never erodes the audit trail.

## 10. Plan — holdings-first, one zone

Explore, Points, and Status Match become tabs of one **Plan** zone, and the
user's ledger is the default lens everywhere:

- **Explore results sort by affordability:** "bookable with what you hold
  today" first (green chip), then "bookable after a transfer you can make,"
  then everything else. The joins already exist (`applyHoldings` + transfer
  graph); they're just not applied to the results view.
- **Points graph is the drill-down, in place.** Expanding an Explore row shows
  globe → transfer path → "earn the gap" inline, instead of bouncing to an
  unlisted URL. `/points` keeps its deep-linkable route but is reached through
  Plan, finishing the existing instinct that it's a drill-down, not a peer.
- **Status Match starts from *your* tiers**, not a blank picker; the blank
  picker remains for exploration. Data note: `Assets:Rewards:Status:*` holds
  tier-qualifying *counters*, and the taxonomy deliberately keeps tiers
  ("entity state, not balances") out of accounts. **Proposed convention:**
  tiers are recorded as beancount event directives —
  `YYYY-MM-DD event "status:<program-slug>" "<tier-slug>"` — already
  first-class in the schema (`directives_event`), human-writable in the
  Journal, and AI-draftable. The latest event per program is the current
  tier; an empty value clears it. Readers treat the convention as optional:
  no events → today's blank-picker behavior.
- Vault home's "with what you hold today" teasers deep-link into Plan with the
  lens pre-applied.

## 11. Journal recedes — and that's a feature

The CodeMirror editor, filters, and raw-text fidelity stay exactly as built,
renamed **Journal** in the nav: the audit layer for when the cards aren't
precise enough. Every surface deep-links into it filtered to the relevant
account/date. Plain-text ownership stays the brand promise; it stops being the
onboarding experience.

## 12. First run

New user → Vault is empty → one prompt: *"Tell me a card you hold, or drop a
statement."* "I have an Amex Platinum with about 80k MR" → Assistant drafts
open + opening balance → approve → the Vault lights up **and** Plan immediately
shows what 80k MR books. Say it, approve it, see what it's worth — the whole
product in one loop, under two minutes, built entirely from existing pieces.

## 13. Mapping to delivery slices

This doc adds no new slice; it re-sequences what each slice *surfaces*.

| Slice | Experience deliverable on top of the slice's foundation |
|---|---|
| **F1** | Vault home v1 (holdings groups, journal deep-links) as the Browse projection UI; Journal at power-user altitude; nav spine `Vault · Plan · Inbox · Journal` ships (Inbox honest-empty, Plan = today's three tools re-homed) |
| **F2** | Inbox real (capture lifecycle, batch review, global drop target); Vault lanes (needs-review / auto-posted); Assistant unification can land here — it's orthogonal to the event work |
| **F3** | Forwarding address surfaced in Inbox empty state + settings; auto-posted lane live end-to-end; **automation log** ships with the email worker (every run recorded from day one); **rules + playground** layer on next (F3.5) — log first, authoring second |
| **F4** | Reconciliation workbench inside the Inbox zone; net-worth valuation decided → Vault headline tile gets ₹ estimate |
| **F5** | Ledger switcher in the shell; Vault consolidates cross-ledger |

Plan-zone unification (holdings-first Explore, inline points drill-down,
status-from-ledger) has no F-dependency beyond F1's projections and can proceed
in parallel.

## 14. What this does not change

- DO topology, event model, trust contract, agent registries' internals — all
  as decided. This is recomposition of existing pieces, not architecture.
- No bank feeds, no scanning — privacy posture unchanged.
- Beancount remains the source of truth and remains fully visible (Journal).

## 15. Open questions

- Assistant placement: persistent panel vs summon-only (`Cmd+K`) — panel costs
  width on the graph-heavy Plan screens.
- Inbox-landing threshold in §5 (always badge-only vs land-on-Inbox above N
  pending).
- Expiry data source: derive from `#reward-expiry` events only, or add KG-known
  programme expiry policies as projected warnings before any event exists.
- "Estimated value" methodology for the net-worth tile (cpp source) — same
  open question as F4/F5 valuation, one decision should cover both.
- Rule semantics (§9): first-match-wins vs all-matching-rules-run; what
  happens to a matched email when its rule is later edited (no retroactive
  re-runs — replay only via the playground, explicitly?).
- Rule failure handling: a rule whose prompt errors or times out should
  degrade to plain `needs_review` capture, never drop the email — confirm
  this is an invariant, not a setting.
