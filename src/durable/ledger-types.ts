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
