import { tool } from 'ai'
import { z } from 'zod'

// Server tool: fetch the user's ledger snapshot — today's date, open
// accounts, schema DDL, row counts, sample transactions. Code-mode style:
// the sandboxed program calls this once at the top to anchor any
// follow-on SQL on the real schema/account names, instead of relying on
// a giant static system-prompt block.
export function ledgerSnapshotTool(fetchSnapshot: () => Promise<unknown>) {
  return tool({
    description:
      'Fetch the live ledger snapshot — `today` (YYYYMMDD), `accounts` (open ' +
      'accounts with currencies), `row_counts`, `sample_txns`, `schema_ddl`. ' +
      'Returns an object you should anchor any subsequent `query_sql` on. ' +
      'No arguments.',
    inputSchema: z.object({}),
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
