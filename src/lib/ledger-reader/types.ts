import type { LedgerRow } from '@/lib/ledger-core/types'

export type ReaderRow = Omit<LedgerRow, 'id'> & { id: number | null; tempId?: string }

export type SearchResult = {
  rows: ReaderRow[]
  total: number
}

export interface LedgerReader {
  search(q: string, limit: number, offset: number): Promise<SearchResult>
  get(idOrTempId: number | string): Promise<ReaderRow | null>
}
