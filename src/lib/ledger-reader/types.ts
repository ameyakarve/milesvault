import type { LedgerRow } from '@/lib/ledger-core/types'

export type ReaderRow = LedgerRow

export type SearchResult = {
  rows: ReaderRow[]
  total: number
}

export interface LedgerReader {
  search(q: string, limit: number, offset: number): Promise<SearchResult>
  get(id: number): Promise<ReaderRow | null>
}
