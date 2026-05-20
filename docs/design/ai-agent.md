# AI Agent — Design

Generative-UI personal-finance agent built on Cloudflare's [Project Think](https://blog.cloudflare.com/project-think/) (Agents SDK), wired into the existing `LedgerDO`.

## Product shape

Three modes inside a single `/ai` tab, one rolling conversation thread.

- **Analyst.** Ask questions, get charts + tables back. Read-only.
- **Ingest.** Drag a statement (PDF / CSV / OFX / QIF / image). One card progresses through stages (Reading → Found N rows → Categorized → Reconciled → Ready). Approve commits a batch. Inline editing within the card.
- **Editor (freeform).** Type "split this Costco", "delete that dup", "open a Schwab account". Agent emits a `DiffCard` with proposed Beancount text, inline-editable. Approve commits.

No pinned dashboards, no saved views in v1.

## Write path

Path A: **agent generates Beancount text**, splices into journal, calls existing `journalPut`. No new write API on `LedgerDO`. Risks: malformed Beancount → existing parser rejects → agent self-corrects next turn.

Scope: **journal data only**. No app preferences, no global account renames.

## Read path

Not a zoo of pre-baked tools. One tool: **`sqlQuery(sql, params)`** — read-only against `LedgerDO`'s SQLite, parameterized, `LIMIT` enforced, timeout-bounded. The agent writes SQL.

Schema-with-meaning lives in the system prompt:

- **`beancount-primer.md`** — txns balance, account hierarchy, directives, tags, links, costs, prices, metadata.
- **`schema-mapping.md`** — table-by-table mapping back to Beancount syntax (`transactions` row ↔ `YYYY-MM-DD * "payee" "narration"`, etc.).
- **`query-conventions.md`** — read-only, LIMIT, ordinal dates via `dateToInt`, scaled-decimal `(scaled, scale)` pairs, prefer joins, never `SELECT *` in user-facing answers.

## Model

Workers AI **`@cf/moonshotai/kimi-k2.6`** via `createWorkersAI`. Vision-capable (used for PDF/image ingest via the same model or `env.AI.toMarkdown`). If quality is rough we swap to AI Gateway → Anthropic later without touching tool schemas.

## Infrastructure

- **`AgentDO extends Think<Env>`**, per user. Holds session, profile, attachment metadata. Reaches `LedgerDO` via DO stub.
- **`LedgerDO`** gets two additive methods:
  - `sqlQuery(sql, params)` — read-only.
  - `previewJournalPut(text)` — dry-run for the Editor's diff.
  - and a new `attachments` table (Phase 5).
- **R2** — uploaded statements + receipts. Keyed by sha256.
- **Routing.** `/api/agents/[id]` Next.js route handler auths via next-auth, resolves user id, opens stub. WebSocket upgrade likely needs a worker-entry shim around OpenNext; SSE fallback if that fights us.

## Memory

Three context layers in Project Think's session config:

1. **Static system prompt** (~3–5k tokens, cached): primer + schema-mapping + query-conventions + edit-conventions + tool catalog.
2. **Per-turn ledger snapshot** (~1k tokens, auto-refreshed): account tree with currencies and open/close status; row counts per table; 5–10 sampled recent journal entries verbatim (teaches the model the user's formatting style); today's date as ordinal.
3. **User profile** (small, writable through confirmation cards): account aliases, operating currency, anything the user has explicitly asked the agent to remember.

## Component vocabulary (gen-UI registry)

- `Markdown` — agent narration.
- `Callout` — anomaly / warning / error.
- `KpiTile` — single number + delta + sparkline.
- `LineChart`, `BarChart`, `StackedBar`, `Donut`, `Heatmap` — chart primitives. Heatmap reuses the spend-heatmap renderer.
- `TxTable` — transactions, sortable, inline-editable rows.
- `AccountCard` — balance + recent activity.
- `IngestReview` — progressing header + editable rows + dedup chips + reconciliation summary + Approve.
- `DiffCard` — before/after with proposed Beancount text editable inline, Approve / Reject.
- `ProfileChangeCard` — confirm a writable-memory update.

Shared Zod schemas in `src/durable/agent-ui-schemas.ts`. Same schema validates tool output and types the React props.

## Tool surface

- `sqlQuery(sql, params?)`
- `proposeJournalEdit(instruction)` → `{diff, proposed_text, proposal_id}`
- `commitJournalEdit(proposal_id, edited_text?)`
- `ocrDocument(r2_key)` → markdown (via `env.AI.toMarkdown`)
- `extractRows(markdown, account_hint?)`
- `enrichRows(rows)`
- `dedupeAgainstLedger(rows, account)`
- `reconcileToClose(rows, expected_close)`
- `commitIngest(reviewed_rows)`
- `attachDoc(txn_id, r2_key, role)`, `listAttachments(txn_id)`, `readAttachment(doc_id)` (vision)
- `proposeProfileUpdate(field, value)`

## Phasing

| Phase | Deliverable | Demo target |
|---|---|---|
| 0 | Bindings, empty AgentDO, route returns stub echo | `curl /api/agents/me` works on staging |
| 1 | Analyst spine: sqlQuery + system prompt + chat shell | "Groceries last month by week" → markdown + small table |
| 2 | Chart primitives + AccountCard | "Spend over time by category" → stacked bar |
| 3 | Freeform editor + DiffCard | "Split the Costco $200" → DiffCard → approve |
| 4 | Ingest pipeline + IngestReview | Drop a Chase PDF → review card → approve |
| 5 | Attachments | "Show me that receipt"; ingest auto-links source doc |
| 6 | User profile / aliases | "My spending account = Chase Checking" remembered |

Each phase is a PR shippable to staging.

## Parked TODOs

- Categorization rule-learning UX (prompt after correction vs. silent).
- Pinned dashboards / saved views.
- Reconciliation as a standalone durable artifact.
- Mobile receipt capture.
- Goals & budgets.
- Vega-Lite escape hatch for arbitrary chart shapes.
- Sandboxed code execution (Project Think Tier 1 / `@cloudflare/codemode`).
- Sub-agents / Facets.
- Multi-thread sessions.
