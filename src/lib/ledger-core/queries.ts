import type { SearchFilter } from '@/durable/search-parser'

export const ROW_COLS =
  'id, raw_text, date, flag, t_payee, t_account, t_currency, t_tag, t_link, created_at, updated_at'

export function escapeFts(s: string): string {
  return s.replace(/"/g, '""')
}

export type SearchWhere = {
  whereSql: string
  params: (string | number)[]
  ftsQuery: string
}

export function buildSearchWhere(filter: SearchFilter): SearchWhere {
  const ftsTerms: string[] = []
  for (const t of filter.accountTokens) ftsTerms.push(`t_account:"${escapeFts(t)}"`)
  for (const t of filter.tagTokens) ftsTerms.push(`t_tag:"${escapeFts(t)}"`)
  for (const t of filter.linkTokens) ftsTerms.push(`t_link:"${escapeFts(t)}"`)
  for (const t of filter.freeTokens) ftsTerms.push(`"${escapeFts(t)}"`)
  const ftsQuery = ftsTerms.join(' ')

  const whereParts: string[] = []
  const params: (string | number)[] = []
  if (ftsQuery.length > 0) {
    whereParts.push(
      't.id IN (SELECT rowid FROM transactions_fts WHERE transactions_fts MATCH ?)',
    )
    params.push(ftsQuery)
  }
  if (filter.dateFrom != null) {
    whereParts.push('t.date >= ?')
    params.push(filter.dateFrom)
  }
  if (filter.dateTo != null) {
    whereParts.push('t.date <= ?')
    params.push(filter.dateTo)
  }
  const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''
  return { whereSql, params, ftsQuery }
}
