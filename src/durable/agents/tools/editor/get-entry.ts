import { tool } from 'ai'
import { z } from 'zod'
import { ENTRY_KINDS, type EntryKind } from '@/durable/ledger-types'

export type EntryBlob = {
  kind: EntryKind
  id: number
  updated_at: number
  raw_text: string
}

// Server tool: read ONE existing entry's full beancount text + OCC version, by
// kind+id (ids come from a query_sql result). To EDIT or DELETE an entry the
// model reads it here, then passes raw_text verbatim as draft_transaction's
// `replaces`. Fetcher injected (no DO closure).
export function getEntryTool(
  fetchEntry: (ref: { kind: EntryKind; id: number }) => Promise<EntryBlob | null>,
) {
  return tool({
    description:
      'Read the full beancount text of ONE existing entry (use a `transactions.id` from a `query_sql` result; kind is usually "txn"). ' +
      'Returns `{ ok: true, kind, id, updated_at, raw_text }`. To EDIT or DELETE this entry, copy `raw_text` VERBATIM into `draft_transaction`\'s `replaces`. ' +
      'Returns `{ ok: false, error: "not_found" }` if the entry is gone.',
    inputSchema: z.object({
      kind: z.enum(ENTRY_KINDS),
      id: z.number().int().positive(),
    }),
    execute: async ({ kind, id }) => {
      const e = await fetchEntry({ kind, id })
      if (!e) return { ok: false as const, error: 'not_found' as const }
      return { ok: true as const, ...e }
    },
  })
}
