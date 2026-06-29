import { tool } from 'ai'
import { z } from 'zod'
import type { QuerySqlResult } from './query-sql'

// Server tool: list the user's ledger account TREE under a prefix, trimmed to a
// depth — distinct account paths, deduped. Grounds the real taxonomy so the model
// can pick an actual path (e.g. the `prefix` for an `/accounts` spend link, or the
// account a category lives under) instead of guessing `Expenses:Fuel` vs
// `Expenses:Transport:Fuel`. Backed by the same read-only query closure as
// `query_sql`, so no new DO surface; the model never has to write SQL for this.
const OK = z.object({ ok: z.literal(true), accounts: z.array(z.string()) })
const ERR = z.object({ ok: z.literal(false), error: z.string() })

export function listAccountsTool(
  runQuery: (
    sql: string,
    params: ReadonlyArray<string | number | null>,
  ) => Promise<QuerySqlResult>,
) {
  return tool({
    description:
      "List the user's ledger account paths under a prefix, trimmed to a depth — distinct, deduped, sorted. Use it to find the REAL account path for a category before building an `/accounts` deep link (e.g. `{prefix:'Expenses', depth:4}` returns the actual Expenses subtree, so you pick `Expenses:Transport:Fuel` rather than guessing). Returns `{ accounts: string[] }`.",
    inputSchema: z.object({
      prefix: z
        .string()
        .optional()
        .describe(
          "Account-path prefix to list under, e.g. 'Expenses' or 'Expenses:Travel'. Empty = whole tree.",
        ),
      depth: z
        .number()
        .int()
        .optional()
        .describe('Max path segments to keep (default 3). E.g. depth 3 → Expenses:Transport:Fuel.'),
    }),
    outputSchema: z.union([OK, ERR]),
    execute: async ({ prefix, depth }) => {
      const root = (prefix ?? '').trim().replace(/:+$/, '')
      const like = root ? `${root.replace(/[%_]/g, '')}%` : '%'
      const d = Math.max(1, Math.min(depth ?? 3, 8))
      try {
        const res = await runQuery(
          'SELECT DISTINCT account FROM postings WHERE account LIKE ? ORDER BY account',
          [like],
        )
        const set = new Set<string>()
        for (const row of res.rows) {
          const acct = String((row as { account?: unknown }).account ?? '')
          if (!acct) continue
          set.add(acct.split(':').slice(0, d).join(':'))
        }
        return { ok: true as const, accounts: [...set].sort() }
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
      }
    },
  })
}
