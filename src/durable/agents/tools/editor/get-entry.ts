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
// kind+id (the id comes from a query_sql result). The fetcher is injected (no
// DO closure). raw_text enters context only for the entries the model is about
// to change — the whole point of the query_sql → get_entry → draft split.
export function getEntryTool(
  fetchEntry: (ref: { kind: EntryKind; id: number }) => Promise<EntryBlob | null>,
) {
  return tool({
    description:
      'Read the full beancount text of ONE existing entry (use a `transactions.id` from a `query_sql` result). ' +
      'Returns `{ ok: true, kind, id, updated_at, raw_text }`. Carry `updated_at` as the entry version ' +
      'when you set this entry as a `target` in `draft_transaction` (edit = target + new text; ' +
      'delete = target + empty text). Returns `{ ok: false, error: "not_found" }` if the entry is gone.',
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
