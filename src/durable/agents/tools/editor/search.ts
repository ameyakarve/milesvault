import { tool } from 'ai'
import {
  postingSearchSchema,
  type PostingSearchFilter,
  type PostingSearchResponse,
} from '@/lib/ledger-core/posting-search'

// Server tool: structured search over the user's existing ledger postings — the
// ergonomic way to FIND entries (to read, edit, or attribute) WITHOUT
// hand-writing SQL. Filters combine with AND; `payee_q` is full-text over payee
// + narration. Returns matching postings with their `txn_id` so the model can
// read the full entry via get_entry and edit it via draft_transaction. Fetcher
// injected (no DO closure).
export function searchTool(
  search: (filter: PostingSearchFilter) => Promise<PostingSearchResponse>,
) {
  return tool({
    description:
      "Search the user's EXISTING ledger entries by structure — the primary way to FIND entries to read, edit, or attribute. Prefer this over hand-writing `query_sql` for lookups (use `query_sql` only for aggregates/analytics). " +
      'All filters optional, combined with AND: `accounts.prefix` / `accounts.exact` (account paths — resolve a programme/card name to its account from the accounts list FIRST, then filter by it; do not guess the display name), `currencies`, `date.from` / `date.to` (YYYY-MM-DD, `to` exclusive), `amount.signed` (gte/lte on the signed amount), `sign` ("debit" = negative, "credit" = positive), `payee_q` (full-text over payee + narration), `flag`, `limit`. ' +
      'Returns `{ rows: [{ txn_id, idx, date, flag, payee, narration, account, amount, currency }], truncated, limit }`. Take a row\'s `txn_id`, read the full entry with `get_entry` (kind "txn"), then edit/delete via `draft_transaction`.',
    inputSchema: postingSearchSchema,
    execute: async (filter) => await search(filter),
  })
}
