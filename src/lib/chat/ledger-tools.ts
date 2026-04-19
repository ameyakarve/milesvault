import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import {
  createLedgerClient,
  LedgerBindingError,
  LedgerInputError,
  MAX_APPLY_ITEMS,
  MAX_LIMIT,
} from '@/lib/ledger-api'

function formatError(e: unknown): { ok: false; errors: string[] } {
  if (e instanceof LedgerInputError) return { ok: false, errors: e.errors }
  if (e instanceof LedgerBindingError) return { ok: false, errors: [e.message] }
  return { ok: false, errors: [(e as Error)?.message ?? 'unknown error'] }
}

export function buildLedgerTools(env: Cloudflare.Env, email: string): ToolSet {
  const client = createLedgerClient(env, email)

  return {
    ledger_search: tool({
      description:
        'Search transactions by a query (e.g. "swiggy", "account:Expenses:Food", date ranges). Empty q returns most-recent first. Results capped by limit (max 100).',
      inputSchema: z.object({
        q: z.string().default(''),
        limit: z.number().int().min(1).max(MAX_LIMIT).default(20),
        offset: z.number().int().min(0).default(0),
      }),
      execute: async ({ q, limit, offset }) => {
        try {
          return await client.search(q, limit, offset)
        } catch (e) {
          return formatError(e)
        }
      },
    }),
    ledger_get: tool({
      description: 'Fetch a single transaction by its numeric id.',
      inputSchema: z.object({ id: z.number().int().positive() }),
      execute: async ({ id }) => {
        try {
          const txn = await client.get(id)
          return txn ?? { ok: false, errors: ['not found'] }
        } catch (e) {
          return formatError(e)
        }
      },
    }),
    ledger_apply: tool({
      description:
        `Propose an atomic batch of ledger edits. Creates add new transactions, updates replace an existing transaction by id with new raw_text, deletes remove by id. All items apply together or none do. The user must approve in the UI before anything is saved. At least one of creates/updates/deletes must be non-empty. Max ${MAX_APPLY_ITEMS} items total. Use updates (not delete+create) when changing a single existing transaction.`,
      inputSchema: z.object({
        creates: z
          .array(z.object({ raw_text: z.string().min(1) }))
          .default([]),
        updates: z
          .array(z.object({ id: z.number().int().positive(), raw_text: z.string().min(1) }))
          .default([]),
        deletes: z
          .array(z.object({ id: z.number().int().positive() }))
          .default([]),
      }),
    }),
  }
}
