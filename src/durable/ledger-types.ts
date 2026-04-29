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
  meta?: Record<string, string> | null
}

export type PadInput = {
  date: string
  account: string
  account_pad: string
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
  | 'pad'
  | 'price'
  | 'note'
  | 'document'
  | 'event'

export type DirectiveInput =
  | ({ kind: 'open' } & OpenInput)
  | ({ kind: 'close' } & CloseInput)
  | ({ kind: 'commodity' } & CommodityInput)
  | ({ kind: 'balance' } & BalanceInput)
  | ({ kind: 'pad' } & PadInput)
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
}

export type EntryPad = EntryBase & {
  kind: 'pad'
  account: string
  account_pad: string
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
  | EntryPad
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
