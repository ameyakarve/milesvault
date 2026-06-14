# Editor: chat-driven add / edit / delete of existing txns

Goal: the editor assistant can modify and delete existing entries, not just
append. Chat-driven. No context bloat (model never sees the whole ledger).

## Locked design

- **Chat-driven only.** No tap-to-select. The model finds entries from your words.
- **`find_entries(filters)`** tool — backed by existing `search_postings`
  (account / date / payee / amount / sign). Returns **compact txn rows**
  (`kind, id, date, payee, amount, accounts`), **not** raw_text. Capped.
- **Match handling:**
  - ≤ 10 matches → diff card directly (batch approve).
  - > 10 → gen-UI checkbox list of **titles only** (date + payee) → tick → diff card.
- **Context lean:** rows carry id only. Model calls **`get_entry(ref)`** to pull
  raw_text **only** for the entries it will actually change.
- **Edit primitive:** extend `draft_transaction`. Each entry `{ target?, text? }`:
  - add → no target + text
  - edit → target + text
  - delete → target + no text
- **Write:** reuse `replaceBuffer(knownIds, buffer)`. targets → `knownIds`
  (delete-by-id), texts → `buffer` (insert). OCC via `expected_updated_at` →
  conflict-safe, reuses existing `occ_conflict` message.

## Workflow

1. You: "change yesterday's Starbucks to ₹500"
2. Model → `find_entries`
3. 1 match → diff card · multiple (≤10) → diff card · >10 → selection list → diff card · 0 → `clarify`
4. Model → `get_entry` for the targets → drafts edit(s) with `target`
5. You approve → in-place replace (same id)

## Build order

1. **Server (LedgerDO RPC + REST + agent tools)**
   - `find_entries`: wrap `search_postings`; collapse posting rows → txn rows
     (`kind:'txn', id, date, payee, amount, accounts`); cap (e.g. 50) + return
     total count.
   - `get_entry(ref)`: return `{ kind, id, updated_at, raw_text }` by id.
   - Register both as tools for the `ledger` agent.
2. **Schema** — `draftTransactionBatchSchema`: add optional
   `target: { kind, id, expected_updated_at }` per entry.
3. **Validator** — `classifyDraftEntry`: allow empty text **iff** `target`
   present (= delete); else classify text as today.
4. **Tool + prompt** — `draft_transaction` description gains add/edit/delete
   semantics; `tool-rules`: on a change/fix/delete request, `find_entries`
   first, draft with `target` — never append a duplicate.
5. **Gen-UI card** — render edit rows as before→after diff, delete rows as
   strikethrough; approve builds `knownIds` from targets + buffer from texts →
   one `replaceBuffer`.
6. **Selection gen-UI** — >10 path: checkbox list (titles only) → selected
   targets feed the diff card.

## Guardrails

- Never load the full ledger into context — only `find_entries` rows + per-target
  `get_entry`.
- `find_entries` is capped; surface "N more not shown".
- One `replaceBuffer` per approval; OCC guards every edit/delete.
