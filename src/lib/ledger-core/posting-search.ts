import { z } from 'zod'

export const POSTING_SEARCH_DEFAULT_LIMIT = 10000
export const POSTING_SEARCH_MAX_LIMIT = 25000

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
const accountStr = z
  .string()
  .min(1)
  .regex(/^[A-Z][A-Za-z0-9-]*(:[A-Z0-9][A-Za-z0-9-]*)*$/, 'invalid account')

export const postingSearchSchema = z
  .object({
    date: z
      .object({
        from: dateStr.optional(),
        to: dateStr.optional(),
      })
      .optional(),
    accounts: z
      .object({
        exact: z.array(accountStr).max(50).optional(),
        prefix: z.array(accountStr).max(50).optional(),
      })
      .optional(),
    currencies: z.array(z.string().min(1).max(16)).max(20).optional(),
    amount: z
      .object({
        signed: z
          .object({
            gte: z.number().finite().optional(),
            lte: z.number().finite().optional(),
          })
          .optional(),
      })
      .optional(),
    sign: z.enum(['debit', 'credit']).optional(),
    payee_q: z.string().min(1).max(200).optional(),
    flag: z.enum(['*', '!']).optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(POSTING_SEARCH_MAX_LIMIT)
      .optional(),
  })
  .strict()

export type PostingSearchFilter = z.infer<typeof postingSearchSchema>

export type PostingSearchRow = {
  txn_id: number
  idx: number
  date: string
  flag: '*' | '!' | null
  payee: string
  narration: string
  account: string
  amount: string
  currency: string
}

export type PostingSearchResponse = {
  rows: PostingSearchRow[]
  truncated: boolean
  limit: number
}

// find_entries — TXN-level search for the edit/delete flow. Same filter shape
// as posting search, but returns whole transactions (compact, NO raw_text — the
// model pulls full text per-target via get_entry) so context stays lean.
export const FIND_ENTRIES_MAX = 50

export type FindEntryRow = {
  kind: 'txn'
  id: number
  updated_at: number // OCC version — carried into the edit target
  date: string
  payee: string
  narration: string
  flag: '*' | '!' | null
  postings: { account: string; amount: string; currency: string }[]
}

export type FindEntriesResponse = {
  rows: FindEntryRow[]
  total: number // total matches before the FIND_ENTRIES_MAX cap
  truncated: boolean
}
