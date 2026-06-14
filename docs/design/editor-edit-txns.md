# Editor: chat-driven add / edit / delete of existing txns

Goal: the editor assistant can ADD, EDIT, and DELETE entries through one clean
loop. Chat-driven. No context bloat. Discovery is flexible (the model composes
queries); mutation is locked down (structured, OCC-guarded, user-approved).

## Why query-driven discovery (not hardcoded filters)

A hardcoded `find_entries(filter)` bakes a filter taxonomy into SQL — brittle,
and every new query shape needs new code. Instead the model composes its own
read-only `SELECT` over the ledger. More flexible, less code, more LLM-first.
(Dropped the `find_entries` RPC/tool/routes from the step-1 spike.)

## Tool tiers

- **Code level — the ONLY mutation path (no model):**
  - `replaceBuffer(knownIds, buffer)` — OCC + validation + serialize.
    targets → delete-by-id, texts → insert. add/edit/delete all land here.
- **Codemode tier (bounded reads — safe to compose freely):**
  - `query_sql` — READ-ONLY (`SELECT`/`WITH` only; comment-stripped; `MAX_ROWS`
    1000 + `truncated`). Model writes its own search/count. Schema DDL is in the
    snapshot.
  - `get_entry(kind, id)` — one entry's full canonical text + `updated_at`.
  - closed-set `list_*` resolvers (`list_reward_accounts`, account / balance-
    target lists) — finite curated lists, no roaming.
- **Orchestrator tier (judgment + graph traversal — editor brain only):**
  - `kb_resolve` / `kb_related` / `kb_get` / `card_guide` — KG lookups & edge
    walks. Unbounded traversal stays here, NOT in codemode.
  - `draft_transaction` (the act surface), `clarify`, `select_entries` (gen-UI),
    `add_card`.

Principle: **a tool that returns a finite, curated list is safe at any tier; a
tool that walks edges is orchestrator-only.** Codemode reads the user's ledger;
the orchestrator combines that with KG meaning, then drafts.

## The edit primitive

Extend `draft_transaction`. Each entry `{ target?, text? }`:
- add → no target + text
- edit → target + text
- delete → target + no text

`target` = `EntryRef2 { kind, id, expected_updated_at }` (from `get_entry`).
Approval composes one `replaceBuffer`: targets → `knownIds` (delete), texts →
buffer (insert). OCC (`expected_updated_at`) makes every edit/delete
conflict-safe; stale → existing `occ_conflict` message.

## The loop (one shape; branches only on discovery)

- Classify intent: add / edit / delete / mixed (model, from the message).
- **Add** → knowledge tools as needed → `draft_transaction` with `text`, no target.
- **Edit / delete** → `query_sql` to find candidates (count + id/title):
  - 0 → tell the user, stop
  - 1–10 → `get_entry` each → `draft_transaction` with `target`
  - > 10 → `select_entries` (titles only) → user ticks → `get_entry` chosen → draft
  - genuinely ambiguous → `clarify`
- **Approve** → one `replaceBuffer` (inserts adds, deletes+reinserts edits by id,
  deletes removals). Journal refetches.

## Build order

1. **Wire codemode reads to the ledger agent** — add `query_sql` (read-only,
   already capped) + `get_entry` + the `list_*` resolvers to the `ledger` agent's
   tool set. Include `schema_ddl` in the editor snapshot. Remove `find_entries`.
2. **Schema** — `draftTransactionBatchSchema`: optional
   `target { kind, id, expected_updated_at }` per entry.
3. **Validator** — `classifyDraftEntry`: empty text allowed iff `target` present
   (= delete); else classify text as today.
4. **draft_transaction + prompt** — add/edit/delete semantics; tool-rules: on a
   change/fix/delete request, `query_sql` to locate (narrow SELECT + LIMIT),
   `get_entry` per target, draft with `target` — never append a duplicate.
5. **Gen-UI card** — edit rows as before→after diff, delete rows struck through;
   approve builds `knownIds` from targets + buffer from texts → one `replaceBuffer`.
6. **`select_entries` gen-UI** — >10 path: checkbox list (titles only) → chosen
   ids feed the diff card.

## Invariants

- The model NEVER writes — every mutation is a drafted `target?/text` the user approves.
- `query_sql` read-only + row-capped; writes only via `replaceBuffer`.
- Context stays lean: `query_sql` SELECTs ids/titles with `LIMIT`; full text pulled
  per-target via `get_entry`.
