# Incorporation: one workflow for add / edit / delete (and statements)

One reusable workflow turns a user's intent (and any attached statement) into a
reviewed set of journal changes. Date is the shard. No codemode, no per-op
special-casing — the user's intent guides the model; corner cases get fixed in
the prompt, not with new lanes.

## The shape

Inputs -> dated changes -> parallel per-date incorporation -> diff -> review.

1. **Plan** (one model call): read the intent (+ statement text if any) -> the set
   of **dates** in scope. Statement rows carry dates; an edit's intent carries the
   timeframe.
2. **Incorporate** (parallel, chunked by date): for each date, a sub-agent gets
   - the date's EXISTING entries (small - few per date),
   - the user's intent (verbatim),
   - account + card/reward context,
   and returns the **new full set of entries for that date**. Add, edit, delete,
   and dedup all fall out of "rewrite this date's bucket."
3. **Diff** (code, per date): canonical-text compare old bucket vs new bucket -
   - old not in new -> **delete** (`replaces` = old text),
   - new not in old -> **add** (`text` = new text),
   - in both -> unchanged, skipped.
   (An edit is just delete-old + add-new; no fragile pairing.)
4. **Review**: the diff renders as the draft card; the user approves -> one
   `replaceBuffer` via the existing `commitDraftOps`.

## Why this is the whole thing

- The model never sees ids, never writes SQL, never searches - each shard gets a
  small, COMPLETE picture (one date) and rewrites it. The before-bucket is the
  `replaces`.
- **Reused across the board:** a statement is just dated rows -> same workflow,
  and each shard finally sees the existing entries for its date (dedup for free).
- One code path to maintain.

## Build

1. **`incorporate` engine** (`src/durable/ingest/incorporate.ts`): stages plan ->
   parallel per-date shard -> diff. Returns draft entries `{ id, text?, replaces? }`
   (the shape the draft card + `commitDraftOps` already take). Model calls
   injected (shareable across DOs), like `runDraftPipeline`.
2. **`incorporate` tool** (editor): server-execute tool - the model calls
   `incorporate({ intent })` on any add/edit/delete request; it returns the draft
   entries; the model relays them to `draft_transaction` (same pattern as
   `read_statement` -> `draft_transaction`). Card + write path unchanged.
3. **Retire** `query_sql` / `get_entry` / `select_entries` from the editor - the
   engine replaces them.
4. **Prompt:** add/edit/delete -> `incorporate({ intent })` -> `draft_transaction`
   with the returned entries.
5. **Statement reuse** (follow-on): point the ingest pipeline at the same engine.

## Kept / dropped

- Kept: the `{ id, text?, replaces? }` draft schema, the diff card, `commitDraftOps`
  (resolve `replaces` -> entry by canonical text -> `replaceBuffer`).
- Dropped: codemode (`query_sql`/`get_entry`), `select_entries`, the >10 picker,
  separate balance/scope lanes.

## Invariants

- Model never writes - every change is a drafted op the user approves.
- The engine reads the ledger by date only; full text never bloats context.
