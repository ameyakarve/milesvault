import { tool } from 'ai'
import { z } from 'zod'

export type QuerySqlResult = {
  columns: string[]
  rows: Array<Record<string, unknown>>
  truncated: boolean
}

// Server tool: run a read-only SQL query against the user's ledger. The
// fetcher is injected (no DO closure) so the tool is shareable across agents
// and DOs. The underlying LedgerDO.query_sql already gates on a leading
// SELECT/WITH keyword — this tool just hands the string through and surfaces
// the rows back to the model.
const QUERY_OUTPUT = z.object({
  ok: z.literal(true),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
  truncated: z.boolean(),
})

const ERROR_OUTPUT = z.object({
  ok: z.literal(false),
  error: z.string(),
})

export function querySqlTool(
  runQuery: (
    sql: string,
    params: ReadonlyArray<string | number | null>,
  ) => Promise<QuerySqlResult>,
) {
  return tool({
    description:
      'Run a single read-only SQL statement against the ledger. Must start with `SELECT` or `WITH`. Use `?` placeholders and pass values via `params` for any user-supplied strings or numbers. Returns `{ columns, rows, truncated }` (rows capped at 1000; each row is keyed by column name). Use the schema from `ledger_snapshot()` — do not guess column names.',
    inputSchema: z.object({
      sql: z
        .string()
        .min(1, 'sql is required')
        .describe('A single SELECT or WITH statement.'),
      params: z
        .array(z.union([z.string(), z.number(), z.null()]))
        .optional()
        .describe('Positional `?` bindings for the SQL, in order.'),
    }),
    outputSchema: z.union([QUERY_OUTPUT, ERROR_OUTPUT]),
    execute: async ({ sql, params }) => {
      // Belt-and-braces: LedgerDO.query_sql already enforces SELECT/WITH-only,
      // but a tool that wraps a read-only RPC should also enforce read-only
      // at the call site — so if the underlying RPC is ever widened, this tool
      // doesn't silently become a write surface.
      const stripped = sql
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/--[^\n]*/g, '')
        .trimStart()
      if (!/^(select|with)\b/i.test(stripped)) {
        return {
          ok: false as const,
          error: 'query_sql only accepts SELECT or WITH statements',
        }
      }
      try {
        const result = await runQuery(sql, params ?? [])
        return { ok: true as const, ...result }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false as const, error: message }
      }
    },
  })
}
