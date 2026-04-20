import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import {
  createLedgerClient,
  LedgerBindingError,
  LedgerInputError,
  MAX_APPLY_ITEMS,
  MAX_LIMIT,
} from '@/lib/ledger-api'
import type { BatchApplyInput } from '@/durable/ledger-types'

function formatError(e: unknown): { ok: false; errors: string[] } {
  if (e instanceof LedgerInputError) return { ok: false, errors: e.errors }
  if (e instanceof LedgerBindingError) return { ok: false, errors: [e.message] }
  return { ok: false, errors: [(e as Error)?.message ?? 'unknown error'] }
}

const SEARCH_DESCRIPTION = `Search the user's beancount transactions. Each transaction is indexed by payee, account segments, currency, tags, and links (fts5/unicode61).

Query grammar (tokens combined by whitespace, all ANDed):
  @<seg>              Match any account segment. Segments are split on ':' — '@expenses:food' expands to @expenses AND @food. Use the same casing as the user's ledger, lowercased.
  #<tag>              Match a tag.
  ^<link>             Match a link.
  >YYYY-MM-DD         Inclusive start date (or >YYYY-MM for start of month).
  <YYYY-MM-DD         Inclusive end date (or <YYYY-MM for end of month).
  YYYY-MM..YYYY-MM    Closed date range (day variants also work).
  YYYY-MM-DD          Exact day.
  <free word>         Matches against ANY indexed field (payee, account, currency, tag, link). NOT raw_text — narration is NOT indexed, so narration words won't match.

Rules:
- Prefer concrete filters over free text. Use @account for category filters and a single free token for payee. Don't pass filler words ("all", "this", "month", "by", "category") — they either filter to zero or duplicate an @filter.
- To find a specific transaction the user refers to by payee+date (e.g. "the Amudham one from April 19"), combine a tight date range with the payee as a free token: '>2026-04-19 <2026-04-19 amudham'.
- To find all transactions for a merchant, use just the payee as a free token: 'amudham'.
- If 0 hits, broaden (drop the date or widen it) before guessing a different merchant name.
- Empty q returns most-recent first.

Examples:
  "find Amudham on 19 April"          -> q: ">2026-04-19 <2026-04-19 amudham"
  "food spend in April 2026"          -> q: ">2026-04-01 <2026-04-30 @expenses:food"
  "all HSBC cashback card charges"    -> q: "@hsbccashback"
  "travel tag this month"             -> q: ">2026-04-01 <2026-04-30 #travel"

Each result row includes its numeric id — use that id for ledger_get / propose_update / propose_delete. Results are capped by limit (max ${MAX_LIMIT}).`

export function buildReadOnlyLedgerTools(env: Cloudflare.Env, email: string): ToolSet {
  const client = createLedgerClient(env, email)

  return {
    ledger_search: tool({
      description: SEARCH_DESCRIPTION,
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
      description:
        'Fetch a single transaction by numeric id. The id MUST come from a prior ledger_search result — never invent ids. Returns {id, raw_text, date, flag, t_payee, t_account, t_currency, t_tag, t_link, created_at, updated_at} or {ok:false, errors:["not found"]}.',
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
  }
}

export function buildAgenticLedgerTools(env: Cloudflare.Env, email: string): ToolSet {
  const readOnly = buildReadOnlyLedgerTools(env, email)
  return {
    ...readOnly,
    propose_create: tool({
      description:
        'Stage a NEW transaction in the user\'s ledger editor buffer. This does NOT save — it places the entry in the editor for the user to review and save. raw_text is a complete beancount transaction (header line + postings). Use accounts and formatting that match existing entries (run ledger_search first). Reply briefly describing what you staged.',
      inputSchema: z.object({ raw_text: z.string().min(1) }),
      execute: async ({ raw_text }) => ({ ok: true, staged: 'create', raw_text }),
    }),
    propose_update: tool({
      description:
        'Stage an edit to an existing transaction in the user\'s ledger editor buffer. You MUST call ledger_get(id) first to see the exact current raw_text, then pass the full replacement raw_text. Does NOT save — user reviews and saves. Reply briefly describing what you staged.',
      inputSchema: z.object({ id: z.number().int().positive(), raw_text: z.string().min(1) }),
      execute: async ({ id, raw_text }) => ({ ok: true, staged: 'update', id, raw_text }),
    }),
    propose_delete: tool({
      description:
        'Stage removal of a transaction from the user\'s ledger editor buffer. Does NOT save — user reviews and saves. Confirm by id. Reply briefly describing what you staged.',
      inputSchema: z.object({ id: z.number().int().positive() }),
      execute: async ({ id }) => ({ ok: true, staged: 'delete', id }),
    }),
  }
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
      needsApproval: true,
      execute: async ({ creates, updates, deletes }) => {
        try {
          const needsTs = [...updates.map((u) => u.id), ...deletes.map((d) => d.id)]
          const tsMap = new Map<number, number>()
          for (const id of needsTs) {
            if (tsMap.has(id)) continue
            const txn = await client.get(id)
            if (!txn) return { ok: false, errors: [`transaction #${id} not found`] }
            tsMap.set(id, txn.updated_at)
          }
          const input: BatchApplyInput = {
            creates,
            updates: updates.map((u) => ({
              id: u.id,
              raw_text: u.raw_text,
              expected_updated_at: tsMap.get(u.id)!,
            })),
            deletes: deletes.map((d) => ({
              id: d.id,
              expected_updated_at: tsMap.get(d.id)!,
            })),
          }
          const result = await client.applyBatch(input)
          if (result.ok === true) {
            return {
              ok: true,
              created: result.created,
              updated: result.updated,
              deleted: result.deleted,
            }
          }
          if (result.kind === 'conflict') {
            return { ok: false, conflicts: result.conflicts }
          }
          const flat = result.errors.flatMap((e) => e.errors)
          return { ok: false, errors: flat }
        } catch (e) {
          return formatError(e)
        }
      },
    }),
  }
}
