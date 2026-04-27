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

export type V2ListResult = {
  rows: TransactionV2[]
  total: number
  limit: number
  offset: number
}
