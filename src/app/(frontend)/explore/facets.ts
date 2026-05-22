import type { PostingSearchRow } from '@/lib/ledger-core/posting-search'

export type FacetKind =
  | 'none'
  | 'month'
  | 'quarter'
  | 'year'
  | 'weekday'
  | 'account_child'
  | 'currency'
  | 'sign'
  | 'flag'

export type FacetConfig = {
  kind: FacetKind
  /** Only used for kind === 'account_child'. Empty string = top-level (Expenses, Assets, …). */
  account_scope?: string
}

export type Bin = { key: string; label: string }

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const NONE_KEY = '__none__'

/** Compute the bin key for one row under a facet. Returns null if the row doesn't fit any bin. */
export function rowBinKey(row: PostingSearchRow, cfg: FacetConfig): string | null {
  switch (cfg.kind) {
    case 'none':
      return NONE_KEY
    case 'month':
      return row.date.slice(0, 7) // YYYY-MM
    case 'quarter': {
      const y = row.date.slice(0, 4)
      const m = Number(row.date.slice(5, 7))
      const q = Math.floor((m - 1) / 3) + 1
      return `${y}-Q${q}`
    }
    case 'year':
      return row.date.slice(0, 4)
    case 'weekday': {
      // Date is YYYY-MM-DD; parse as UTC to keep weekday stable.
      const d = new Date(row.date + 'T00:00:00Z')
      return String(d.getUTCDay())
    }
    case 'account_child': {
      const scope = (cfg.account_scope ?? '').trim()
      if (scope === '') {
        // Top-level segment.
        const seg = row.account.split(':', 1)[0]
        return seg || null
      }
      if (!row.account.startsWith(scope + ':')) return null
      const tail = row.account.slice(scope.length + 1)
      const child = tail.split(':', 1)[0]
      return child || null
    }
    case 'currency':
      return row.currency
    case 'sign':
      if (row.amount == null) return null
      return row.amount.startsWith('-') ? 'debit' : 'credit'
    case 'flag':
      return row.flag ?? '(none)'
  }
}

export function binLabel(key: string, cfg: FacetConfig): string {
  if (cfg.kind === 'weekday') return WEEKDAY_LABELS[Number(key)] ?? key
  if (cfg.kind === 'none') return ''
  return key
}

/** Sort bins in a kind-appropriate order. Time-like ascending, others alpha. */
export function sortBins(keys: Iterable<string>, cfg: FacetConfig): Bin[] {
  const arr = Array.from(new Set(keys))
  if (cfg.kind === 'weekday') {
    arr.sort((a, b) => Number(a) - Number(b))
  } else if (cfg.kind === 'month' || cfg.kind === 'quarter' || cfg.kind === 'year') {
    arr.sort() // lexicographic == chronological for these formats
  } else if (cfg.kind === 'sign') {
    const order = ['debit', 'credit']
    arr.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  } else {
    arr.sort()
  }
  return arr.map((k) => ({ key: k, label: binLabel(k, cfg) }))
}

export type CellIndex = { x: number; y: number }
export type Grid = {
  xBins: Bin[]
  yBins: Bin[]
  /** rows[y][x] = posting indices into the input rows array */
  cells: number[][][]
}

export function buildGrid(
  rows: PostingSearchRow[],
  xCfg: FacetConfig,
  yCfg: FacetConfig,
): Grid {
  const xKeys = new Set<string>()
  const yKeys = new Set<string>()
  const rowKeys: { x: string | null; y: string | null }[] = []
  for (const r of rows) {
    const xk = rowBinKey(r, xCfg)
    const yk = rowBinKey(r, yCfg)
    rowKeys.push({ x: xk, y: yk })
    if (xk !== null) xKeys.add(xk)
    if (yk !== null) yKeys.add(yk)
  }
  const xBins = sortBins(xKeys, xCfg)
  const yBins = sortBins(yKeys, yCfg)
  const xIdx = new Map(xBins.map((b, i) => [b.key, i]))
  const yIdx = new Map(yBins.map((b, i) => [b.key, i]))
  const cells: number[][][] = yBins.map(() => xBins.map((): number[] => []))
  for (let i = 0; i < rows.length; i++) {
    const { x, y } = rowKeys[i]
    if (x === null || y === null) continue
    const xi = xIdx.get(x)
    const yi = yIdx.get(y)
    if (xi === undefined || yi === undefined) continue
    cells[yi][xi].push(i)
  }
  return { xBins, yBins, cells }
}
