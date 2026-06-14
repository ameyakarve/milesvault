import { tool } from 'ai'
import {
  postingSearchSchema,
  type FindEntriesResponse,
  type PostingSearchFilter,
} from '@/lib/ledger-core/posting-search'

// Server tool: find EXISTING transactions to edit or delete. The search fn is
// injected (no DO closure) so the tool is shareable. Returns compact txn rows —
// NO raw_text, so context stays lean; the model pulls full text per-target via
// get_entry only for the entries it will actually change.
export function findEntriesTool(
  search: (filter: PostingSearchFilter) => Promise<FindEntriesResponse>,
) {
  return tool({
    description:
      'Find EXISTING ledger transactions (to edit or delete — NEVER to append a duplicate). ' +
      'Filter by `payee_q` (substring of payee/narration), `date` {from,to}, `accounts` {exact,prefix}, ' +
      '`amount`, `sign`, `currencies`, `flag`. Returns `{ ok, rows, total, truncated }` where each row is ' +
      '`{ kind, id, updated_at, date, payee, narration, flag, postings }` (compact — no full text). ' +
      'Use this BEFORE changing or deleting an existing entry. If `total` is 0 → tell the user nothing matched. ' +
      'If `total` is 1–10 → for each entry you will change, call `get_entry` to read its full text, then ' +
      '`draft_transaction` with that entry as the `target`. If `total` > 10 → do NOT draft; the entries are too ' +
      'many to act on blindly — ask the user to narrow the request.',
    inputSchema: postingSearchSchema,
    execute: async (filter) => ({ ok: true as const, ...(await search(filter)) }),
  })
}
