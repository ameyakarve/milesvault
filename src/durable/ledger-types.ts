export type PostingInput = {
  flag?: string | null
  account: string
  amount?: string | null
  currency?: string | null
  cost_raw?: string | null
  price_at_signs?: 0 | 1 | 2
  price_amount?: string | null
  price_currency?: string | null
  comment?: string | null
  meta?: Record<string, string> | null
}

export type TransactionInput = {
  date: string
  flag?: '*' | '!' | null
  payee?: string
  narration?: string
  postings: PostingInput[]
  tags?: string[]
  links?: string[]
  meta?: Record<string, string> | null
}

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

export type BalanceInput = {
  date: string
  account: string
  amount: string
  currency: string
  // When set, on assertion the projection materializes a reconciling posting
  // routing the gap between `account` and `plug_account`. Subsumes the legacy
  // `pad` directive: a pad+balance pair in beancount text round-trips through
  // a single BalanceInput with `plug_account` set.
  plug_account?: string | null
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
