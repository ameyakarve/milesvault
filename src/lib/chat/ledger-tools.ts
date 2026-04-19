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

const transactionSchema = z.object({
  id: z.number().int(),
  raw_text: z.string(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
})

const searchResultSchema = z.object({
  rows: z.array(transactionSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})

const errorSchema = z.object({
  ok: z.literal(false),
  errors: z.array(z.string()),
})

export function buildLedgerTools(env: Cloudflare.Env, email: string): ToolSet {
  const client = createLedgerClient(env, email)

  return {
    ledger_search: tool({
      description:
        'Search transactions. Returns { rows: Transaction[], total, limit, offset }. Each Transaction is { id, raw_text, created_at, updated_at } — NO postings array; parse raw_text if you need amounts. Empty q returns most-recent first.',
      inputSchema: z.object({
        q: z.string().default(''),
        limit: z.number().int().min(1).max(MAX_LIMIT).default(20),
        offset: z.number().int().min(0).default(0),
      }),
      outputSchema: z.union([searchResultSchema, errorSchema]),
      execute: async ({ q, limit, offset }) => {
        try {
          return await client.search(q, limit, offset)
        } catch (e) {
          return formatError(e)
        }
      },
    }),
    ledger_get: tool({
      description:
        'Fetch a single transaction by id. Returns Transaction { id, raw_text, created_at, updated_at } or { ok:false, errors }. No postings array — parse raw_text for amounts.',
      inputSchema: z.object({ id: z.number().int().positive() }),
      outputSchema: z.union([transactionSchema, errorSchema]),
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
