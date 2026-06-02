import { tool } from 'ai'
import { z } from 'zod'

const SNAPSHOT_OUTPUT = z.object({
  ok: z.literal(true),
  today: z.number().describe('YYYYMMDD as an integer, e.g. 20260602.'),
  accounts: z.array(
    z.object({
      account: z.string(),
      currencies: z.array(z.string()),
      close_date: z.number().nullable(),
    }),
  ),
  row_counts: z.record(z.string(), z.number()),
  sample_txns: z.string().describe('A few rendered transactions for shape reference.'),
  schema_ddl: z.string().describe('CREATE TABLE DDL for every ledger table.'),
})

const ERROR_OUTPUT = z.object({
  ok: z.literal(false),
  error: z.string(),
})

// Server tool: fetch the user's ledger snapshot — today's date, open
// accounts, schema DDL, row counts, sample transactions. Code-mode style:
// the sandboxed program calls this once at the top to anchor any
// follow-on SQL on the real schema/account names, instead of relying on
// a giant static system-prompt block.
export function ledgerSnapshotTool(fetchSnapshot: () => Promise<unknown>) {
  return tool({
    description:
      'Fetch the live ledger snapshot — `today` (YYYYMMDD), `accounts` (open ' +
      'accounts with currencies + close_date), `row_counts`, `sample_txns`, ' +
      '`schema_ddl`. Anchor any subsequent `query_sql` on the schema_ddl. ' +
      'No arguments.',
    inputSchema: z.object({}),
    outputSchema: z.union([SNAPSHOT_OUTPUT, ERROR_OUTPUT]),
    execute: async () => {
      try {
        const snapshot = await fetchSnapshot()
        return { ok: true as const, ...(snapshot as object) }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false as const, error: message }
      }
    },
  })
}
