import { z } from 'zod'

// Zod-first canonical entry schemas (owner decision): ONE definition of what
// an entry is — runtime validators and TS types derive from the same source,
// so nothing (the ingest pipeline, tool schemas, future surfaces) ever
// maintains a drifting mirror. All hand-written types below the schemas are
// z.infer re-exports with identical shapes to the original declarations.

// The kinds of entry the ledger stores — the SINGLE source for both the
// runtime list (z.enum, agent tool schemas) and the EntryKind type. Anything
// that needs the kinds imports from here; no hand-copied mirror.
export const ENTRY_KINDS = [
  'txn',
  'open',
  'close',
  'commodity',
  'balance',
  'price',
  'note',
  'document',
  'event',
] as const

export type EntryKind = (typeof ENTRY_KINDS)[number]

const ZMeta = z.record(z.string(), z.string()).nullable()

export const ZPostingInput = z.object({
  flag: z.string().nullable().optional(),
  account: z.string(),
  amount: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  cost_raw: z.string().nullable().optional(),
  price_at_signs: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  price_amount: z.string().nullable().optional(),
  price_currency: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
  meta: ZMeta.optional(),
})
export type PostingInput = z.infer<typeof ZPostingInput>

export const ZTransactionInput = z.object({
  date: z.string(),
  flag: z.union([z.literal('*'), z.literal('!')]).nullable().optional(),
  payee: z.string().optional(),
  narration: z.string().optional(),
  postings: z.array(ZPostingInput),
  tags: z.array(z.string()).optional(),
  links: z.array(z.string()).optional(),
  meta: ZMeta.optional(),
})
export type TransactionInput = z.infer<typeof ZTransactionInput>

export const ZBalanceInput = z.object({
  date: z.string(),
  account: z.string(),
  amount: z.string(),
  currency: z.string(),
  // When set, on assertion the projection materializes a reconciling posting
  // routing the gap between `account` and `plug_account`. Subsumes the legacy
  // `pad` directive: a pad+balance pair in beancount text round-trips through
  // a single BalanceInput with `plug_account` set.
  plug_account: z.string().nullable().optional(),
  meta: ZMeta.optional(),
})
export type BalanceInput = z.infer<typeof ZBalanceInput>

export type OpenInput = {
  date: string
  account: string
  booking_method?: string | null
  constraint_currencies?: string[]
  meta?: Record<string, string> | null
}

export type CloseInput = {
  date: string
  account: string
  meta?: Record<string, string> | null
}

export type CommodityInput = {
  date: string
  currency: string
  meta?: Record<string, string> | null
}

export type PriceInput = {
  date: string
  commodity: string
  currency: string
  amount: string
  meta?: Record<string, string> | null
}

export type NoteInput = {
  date: string
  account: string
  description: string
  meta?: Record<string, string> | null
}

export type DocumentInput = {
  date: string
  account: string
  filename: string
  meta?: Record<string, string> | null
}

export type EventInput = {
  date: string
  name: string
  value: string
  meta?: Record<string, string> | null
}

export type DirectiveKind =
  | 'open'
  | 'close'
  | 'commodity'
  | 'balance'
  | 'price'
  | 'note'
  | 'document'
  | 'event'

export type DirectiveInput =
  | ({ kind: 'open' } & OpenInput)
  | ({ kind: 'close' } & CloseInput)
  | ({ kind: 'commodity' } & CommodityInput)
  | ({ kind: 'balance' } & BalanceInput)
  | ({ kind: 'price' } & PriceInput)
  | ({ kind: 'note' } & NoteInput)
  | ({ kind: 'document' } & DocumentInput)
  | ({ kind: 'event' } & EventInput)

export type Posting = Required<Pick<PostingInput, 'account'>> & {
  flag: string | null
  amount: string | null
  currency: string | null
  cost_raw: string | null
  price_at_signs: 0 | 1 | 2
  price_amount: string | null
  price_currency: string | null
  comment: string | null
  meta: Record<string, string>
}

type EntryBase = {
  id: number
  date: string
  meta: Record<string, string>
  created_at: number
  updated_at: number
}

export type EntryTxn = EntryBase & {
  kind: 'txn'
  flag: '*' | '!' | null
  payee: string
  narration: string
  postings: Posting[]
  tags: string[]
  links: string[]
}

export type EntryOpen = EntryBase & {
  kind: 'open'
  account: string
  booking_method: string | null
  constraint_currencies: string[]
}

export type EntryClose = EntryBase & {
  kind: 'close'
  account: string
}

export type EntryBalance = EntryBase & {
  kind: 'balance'
  account: string
  amount: string
  currency: string
  plug_account: string | null
}

export type EntryNote = EntryBase & {
  kind: 'note'
  account: string
  description: string
}

export type EntryDocument = EntryBase & {
  kind: 'document'
  account: string
  filename: string
}

export type Entry =
  | EntryTxn
  | EntryOpen
  | EntryClose
  | EntryBalance
  | EntryNote
  | EntryDocument

export type AccountEntriesResponse = {
  entries: Entry[]
  total: number
  limit: number
  offset: number
}

export type AccountSummaryRow = {
  account: string
  currency: string
  balance_scaled: string
  scale: number
  last_activity: number
}
