export type SearchFilter = {
  accountTokens: string[]
  tagTokens: string[]
  linkTokens: string[]
  freeTokens: string[]
  dateFrom?: number
  dateTo?: number
}

const SINGLE_DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH = /^(\d{4})-(\d{2})$/

function lastDayOfMonth(y: number, m: number): number {
  if (m === 2) return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
}

function parseDateToken(s: string, edge: 'start' | 'end'): number | null {
  const day = SINGLE_DAY.exec(s)
  if (day) return +day[1] * 10000 + +day[2] * 100 + +day[3]
  const mo = MONTH.exec(s)
  if (mo) {
    const y = +mo[1]
    const m = +mo[2]
    return y * 10000 + m * 100 + (edge === 'start' ? 1 : lastDayOfMonth(y, m))
  }
  return null
}

export function parseQuery(q: string): SearchFilter {
  const filter: SearchFilter = {
    accountTokens: [],
    tagTokens: [],
    linkTokens: [],
    freeTokens: [],
  }
  if (!q || !q.trim()) return filter
  for (const word of q.trim().split(/\s+/)) {
    if (word.startsWith('@')) {
      const rest = word.slice(1).toLowerCase()
      for (const seg of rest.split(':')) if (seg) filter.accountTokens.push(seg)
    } else if (word.startsWith('#')) {
      const rest = word.slice(1).toLowerCase()
      if (rest) filter.tagTokens.push(rest)
    } else if (word.startsWith('^')) {
      const rest = word.slice(1).toLowerCase()
      if (rest) filter.linkTokens.push(rest)
    } else if (word.startsWith('>')) {
      const d = parseDateToken(word.slice(1), 'start')
      if (d != null) filter.dateFrom = d
    } else if (word.startsWith('<')) {
      const d = parseDateToken(word.slice(1), 'end')
      if (d != null) filter.dateTo = d
    } else if (word.includes('..')) {
      const [a, b] = word.split('..')
      const da = parseDateToken(a, 'start')
      const db = parseDateToken(b, 'end')
      if (da != null) filter.dateFrom = da
      if (db != null) filter.dateTo = db
    } else {
      const start = parseDateToken(word, 'start')
      if (start != null) {
        filter.dateFrom = start
        filter.dateTo = parseDateToken(word, 'end') ?? start
      } else {
        filter.freeTokens.push(word.toLowerCase())
      }
    }
  }
  return filter
}
