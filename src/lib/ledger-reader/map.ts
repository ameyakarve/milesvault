import { parseQuery, type SearchFilter } from '@/durable/search-parser'
import type { LedgerReader, SearchResult, ReaderRow } from './types'

export type MapEntry = {
  id: number | null
  tempId?: string
  raw_text: string
  date: number
  flag: string | null
  t_payee: string
  t_account: string
  t_currency: string
  t_tag: string
  t_link: string
  created_at: number
  updated_at: number
}

function matchesFilter(entry: MapEntry, filter: SearchFilter): boolean {
  if (filter.dateFrom != null && entry.date < filter.dateFrom) return false
  if (filter.dateTo != null && entry.date > filter.dateTo) return false
  const account = entry.t_account.toLowerCase()
  for (const t of filter.accountTokens) {
    if (!tokenPresent(account, t)) return false
  }
  const tag = entry.t_tag.toLowerCase()
  for (const t of filter.tagTokens) {
    if (!tokenPresent(tag, t)) return false
  }
  const link = entry.t_link.toLowerCase()
  for (const t of filter.linkTokens) {
    if (!tokenPresent(link, t)) return false
  }
  if (filter.freeTokens.length > 0) {
    const haystack = [
      entry.t_payee,
      entry.t_account,
      entry.t_currency,
      entry.t_tag,
      entry.t_link,
    ]
      .join(' ')
      .toLowerCase()
    for (const t of filter.freeTokens) {
      if (!tokenPresent(haystack, t)) return false
    }
  }
  return true
}

function tokenPresent(haystack: string, token: string): boolean {
  if (!token) return true
  return haystack.split(/\s+/).includes(token)
}

function toReaderRow(e: MapEntry): ReaderRow {
  return {
    id: e.id,
    tempId: e.tempId,
    raw_text: e.raw_text,
    date: e.date,
    flag: e.flag,
    t_payee: e.t_payee,
    t_account: e.t_account,
    t_currency: e.t_currency,
    t_tag: e.t_tag,
    t_link: e.t_link,
    created_at: e.created_at,
    updated_at: e.updated_at,
  }
}

/**
 * In-memory reader over a Map of rendered entries. No FTS ranking — simple
 * token-presence filters mirroring the server's FTS5 MATCH semantics for
 * the tokens we emit (column-qualified `t_*` + free tokens across columns).
 * Ordering matches DO: date desc, id desc.
 */
export function createMapReader(getEntries: () => Iterable<MapEntry>): LedgerReader {
  return {
    async search(q, limit, offset): Promise<SearchResult> {
      const filter = parseQuery(q)
      const all: MapEntry[] = []
      let scanned = 0
      for (const e of getEntries()) {
        scanned++
        if (matchesFilter(e, filter)) all.push(e)
      }
      console.log(
        `[reader:client] map search q=${JSON.stringify(q)} scanned=${scanned} matched=${all.length}`,
      )
      all.sort((a, b) => {
        if (b.date !== a.date) return b.date - a.date
        return (b.id ?? 0) - (a.id ?? 0)
      })
      const paged = all.slice(offset, offset + limit)
      return { rows: paged.map(toReaderRow), total: all.length }
    },
    async get(idOrTempId): Promise<ReaderRow | null> {
      for (const e of getEntries()) {
        if (typeof idOrTempId === 'number' && e.id === idOrTempId) {
          console.log(`[reader:client] map get id=${idOrTempId} → hit`)
          return toReaderRow(e)
        }
        if (typeof idOrTempId === 'string' && e.tempId === idOrTempId) {
          console.log(`[reader:client] map get tempId=${idOrTempId} → hit`)
          return toReaderRow(e)
        }
      }
      console.log(`[reader:client] map get ${idOrTempId} → miss`)
      return null
    },
  }
}
