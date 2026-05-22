import type { FacetConfig } from './facets'

export type DraftPatch = {
  date_from?: string
  date_to?: string
  account_prefix?: string
  currency?: string
  sign?: 'any' | 'debit' | 'credit'
  flag?: 'any' | '*' | '!'
}

/** Translate a clicked bin into a filter-draft patch. Returns null if the facet can't narrow. */
export function cellNarrow(cfg: FacetConfig, binKey: string): DraftPatch | null {
  switch (cfg.kind) {
    case 'none':
    case 'weekday':
      return null
    case 'month': {
      // binKey = YYYY-MM
      const y = Number(binKey.slice(0, 4))
      const m = Number(binKey.slice(5, 7))
      const from = `${pad4(y)}-${pad2(m)}-01`
      const next = m === 12 ? `${pad4(y + 1)}-01-01` : `${pad4(y)}-${pad2(m + 1)}-01`
      return { date_from: from, date_to: next }
    }
    case 'quarter': {
      const y = Number(binKey.slice(0, 4))
      const q = Number(binKey.slice(6))
      const fromMonth = (q - 1) * 3 + 1
      const toMonth = q * 3 + 1
      const from = `${pad4(y)}-${pad2(fromMonth)}-01`
      const to = toMonth > 12 ? `${pad4(y + 1)}-01-01` : `${pad4(y)}-${pad2(toMonth)}-01`
      return { date_from: from, date_to: to }
    }
    case 'year': {
      const y = Number(binKey)
      return { date_from: `${pad4(y)}-01-01`, date_to: `${pad4(y + 1)}-01-01` }
    }
    case 'account_child': {
      const scope = (cfg.account_scope ?? '').trim()
      const full = scope === '' ? binKey : `${scope}:${binKey}`
      return { account_prefix: full }
    }
    case 'currency':
      return { currency: binKey }
    case 'sign':
      return binKey === 'debit' || binKey === 'credit' ? { sign: binKey } : null
    case 'flag':
      return binKey === '*' || binKey === '!' ? { flag: binKey } : null
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
function pad4(n: number): string {
  return String(n).padStart(4, '0')
}
