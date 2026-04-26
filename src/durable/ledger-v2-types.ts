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

export type TransactionV2 = {
  id: number
  date: string
  flag: '*' | '!' | null
  payee: string
  narration: string
  postings: Posting[]
  tags: string[]
  links: string[]
  meta: Record<string, string>
  raw_text: string
  created_at: number
  updated_at: number
}

export type V2CreateResult =
  | { ok: true; transaction: TransactionV2 }
  | { ok: false; errors: string[] }

export type V2UpdateResult =
  | { ok: true; transaction: TransactionV2 }
  | { ok: false; kind: 'validation'; errors: string[] }
  | { ok: false; kind: 'conflict'; current_updated_at: number }
  | { ok: false; kind: 'not_found' }

export type V2DeleteResult =
  | { ok: true }
  | { ok: false; kind: 'conflict'; current_updated_at: number }
  | { ok: false; kind: 'not_found' }

export type V2ListResult = {
  rows: TransactionV2[]
  total: number
  limit: number
  offset: number
}

export type DirectiveKind =
  | 'transaction'
  | 'open'
  | 'close'
  | 'commodity'
  | 'balance'
  | 'pad'
  | 'price'
  | 'note'
  | 'document'
  | 'event'

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

export type DirectiveInput =
  | { kind: 'transaction'; input: TransactionInput }
  | { kind: 'open'; input: OpenInput }
  | { kind: 'close'; input: CloseInput }
  | { kind: 'commodity'; input: CommodityInput }
  | { kind: 'balance'; input: BalanceInput }
  | { kind: 'pad'; input: PadInput }
  | { kind: 'price'; input: PriceInput }
  | { kind: 'note'; input: NoteInput }
  | { kind: 'document'; input: DocumentInput }
  | { kind: 'event'; input: EventInput }

type DirectiveBase = {
  id: number
  date: string
  meta: Record<string, string>
  raw_text: string
  created_at: number
  updated_at: number
}

export type DirectiveOpen = DirectiveBase & {
  kind: 'open'
  account: string
  booking_method: string | null
  constraint_currencies: string[]
}
export type DirectiveClose = DirectiveBase & {
  kind: 'close'
  account: string
}
export type DirectiveCommodity = DirectiveBase & {
  kind: 'commodity'
  currency: string
}
export type DirectiveBalance = DirectiveBase & {
  kind: 'balance'
  account: string
  amount: string
  currency: string
}
export type DirectivePad = DirectiveBase & {
  kind: 'pad'
  account: string
  account_pad: string
}
export type DirectivePrice = DirectiveBase & {
  kind: 'price'
  commodity: string
  currency: string
  amount: string
}
export type DirectiveNote = DirectiveBase & {
  kind: 'note'
  account: string
  description: string
}
export type DirectiveDocument = DirectiveBase & {
  kind: 'document'
  account: string
  filename: string
}
export type DirectiveEvent = DirectiveBase & {
  kind: 'event'
  name: string
  value: string
}
export type DirectiveTransaction = TransactionV2 & { kind: 'transaction' }

export type DirectiveV2 =
  | DirectiveTransaction
  | DirectiveOpen
  | DirectiveClose
  | DirectiveCommodity
  | DirectiveBalance
  | DirectivePad
  | DirectivePrice
  | DirectiveNote
  | DirectiveDocument
  | DirectiveEvent

export type DirectiveCreateResult =
  | { ok: true; directives: DirectiveV2[] }
  | { ok: false; errors: string[] }

export type DirectiveUpdateResult =
  | { ok: true; directive: DirectiveV2 }
  | { ok: false; kind: 'validation'; errors: string[] }
  | { ok: false; kind: 'conflict'; current_updated_at: number }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'wrong_kind'; expected: DirectiveKind; actual: DirectiveKind }

export type DirectiveDeleteResult =
  | { ok: true }
  | { ok: false; kind: 'conflict'; current_updated_at: number }
  | { ok: false; kind: 'not_found' }

export type DirectiveListResult = {
  rows: DirectiveV2[]
  total: number
  limit: number
  offset: number
}

export type V2ReplaceAllResult =
  | { ok: true; directives: DirectiveV2[]; max_updated_at: number }
  | { ok: false; kind: 'validation'; errors: string[] }
  | { ok: false; kind: 'conflict'; current_max_updated_at: number }
