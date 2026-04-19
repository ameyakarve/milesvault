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
        'Propose a single transaction from a beancount raw_text block. The user must approve in the UI before it is saved. Do not treat a tool call as a completed save — wait for the result.',
      inputSchema: z.object({ raw_text: z.string().min(1) }),
    }),
    ledger_remove: tool({
      description:
        'Propose deletion of a transaction by id. The user must approve in the UI before it is deleted.',
      inputSchema: z.object({ id: z.number().int().positive() }),
    }),
  }
}
