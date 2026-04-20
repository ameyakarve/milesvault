import type { LedgerReader, SearchResult, ReaderRow } from './types'

type ApiTxn = {
  id: number
  raw_text: string
  created_at: number
  updated_at: number
}

type ApiSearchResp = {
  rows: ApiTxn[]
  total: number
  limit: number
  offset: number
}

function toRow(t: ApiTxn): ReaderRow {
  return {
    id: t.id,
    raw_text: t.raw_text,
    date: 0,
    flag: null,
    t_payee: '',
    t_account: '',
    t_currency: '',
    t_tag: '',
    t_link: '',
    created_at: t.created_at,
    updated_at: t.updated_at,
  }
}

/**
 * Browser-side reader that goes through the REST API (GET /api/ledger/transactions).
 * Used as the "server" side of the merged reader.
 */
export function createHttpServerReader(): LedgerReader {
  return {
    async search(q, limit, offset): Promise<SearchResult> {
      console.log(`[reader:server] HTTP search q=${JSON.stringify(q)} limit=${limit} offset=${offset}`)
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      params.set('limit', String(limit))
      params.set('offset', String(offset))
      const res = await fetch(`/api/ledger/transactions?${params.toString()}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`search ${res.status}`)
      const json = (await res.json()) as ApiSearchResp
      return { rows: json.rows.map(toRow), total: json.total }
    },
    async get(id): Promise<ReaderRow | null> {
      console.log(`[reader:server] HTTP get id=${id}`)
      const res = await fetch(`/api/ledger/transactions/${id}`, {
        credentials: 'include',
      })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`get ${res.status}`)
      const t = (await res.json()) as ApiTxn
      return toRow(t)
    },
  }
}
