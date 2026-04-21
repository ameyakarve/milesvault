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
    reply: tool({
      description:
        'Send a message to the user. Use for ALL user-facing text — confirmations, clarifying questions, one-line summaries after staging. Do NOT emit free-form assistant text; every reply must go through this tool. May be called in the same step as a propose_* to say something about what you just staged.',
      inputSchema: z.object({ message: z.string().min(1) }),
      execute: async ({ message }) => ({ ok: true, message }),
    }),
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

