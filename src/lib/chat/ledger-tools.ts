import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import {
  createLedgerClient,
  LedgerBindingError,
  LedgerInputError,
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
    ledger_create: tool({
      description:
        'Create a single transaction from a beancount raw_text block. Returns the created transaction on success, or validation errors.',
      inputSchema: z.object({ raw_text: z.string().min(1) }),
      execute: async ({ raw_text }) => {
        try {
          return await client.create(raw_text)
        } catch (e) {
          return formatError(e)
        }
      },
    }),
    ledger_remove: tool({
      description: 'Delete a transaction by id. Returns { ok: true } if deleted, else not found.',
      inputSchema: z.object({ id: z.number().int().positive() }),
      execute: async ({ id }) => {
        try {
          const removed = await client.remove(id)
          return removed ? { ok: true } : { ok: false, errors: ['not found'] }
        } catch (e) {
          return formatError(e)
        }
      },
    }),
  }
}
