'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { hierarchy, treemap } from 'd3-hierarchy'
import { ChevronRight } from 'lucide-react'
import { ledgerClient } from '@/lib/ledger-client-browser'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { PlanToolbar } from '../plan-toolbar'

type Row = { account: string; currency: string; total: number }
type Tree = { name: string; full: string; self: number; children: Tree[] }

const RANGES = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all', label: 'All' },
] as const
type RangeKey = (typeof RANGES)[number]['key']

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function rangeDates(key: RangeKey): { from: string; to: string } {
  const now = new Date()
  const to = ymd(now)
  if (key === 'all') return { from: '2000-01-01', to }
  if (key === 'ytd') return { from: `${now.getFullYear()}-01-01`, to }
  const months = key === '1m' ? 1 : key === '3m' ? 3 : 6
  const f = new Date(now)
  f.setMonth(f.getMonth() - months)
  return { from: ymd(f), to }
}

// Stable hue per category name — distinct, repeatable tile colors.
const PALETTE = [
  '#4d6e60', '#8c5e3c', '#5b7185', '#7a5b80', '#3f7d77',
  '#996b3d', '#5566a3', '#7d8a3c', '#a3555f', '#456b8c',
]
function colorFor(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]!
}

function fmt(n: number, ccy: string): string {
  const v = Math.round(n)
  return ccy === 'INR'
    ? '₹' + v.toLocaleString('en-IN')
    : v.toLocaleString('en-US') + ' ' + ccy
}

// Build the Expenses hierarchy from full account paths; each account's own
// total lands on its node, parents roll up via d3's .sum().
function buildTree(rows: Row[]): Tree {
  const root: Tree = { name: 'Expenses', full: 'Expenses', self: 0, children: [] }
  const index = new Map<string, Tree>([['Expenses', root]])
  for (const r of rows) {
    const segs = r.account.split(':')
    let parentFull = 'Expenses'
    for (let i = 1; i < segs.length; i++) {
      const full = segs.slice(0, i + 1).join(':')
      let node = index.get(full)
      if (!node) {
        node = { name: segs[i]!, full, self: 0, children: [] }
        index.get(parentFull)!.children.push(node)
        index.set(full, node)
      }
      parentFull = full
    }
    const exact = index.get(r.account)
    if (exact) exact.self += r.total
  }
  return root
}
function nodeAt(root: Tree, path: string[]): Tree {
  let cur = root
  for (const seg of path) {
    const next = cur.children.find((c) => c.name === seg)
    if (!next) break
    cur = next
  }
  return cur
}

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [w, setW] = useState(880)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width
      if (cw && cw > 0) setW(cw)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export function ExpensesView() {
  const [range, setRange] = useState<RangeKey>('3m')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [currency, setCurrency] = useState('INR')
  const [path, setPath] = useState<string[]>([])

  useEffect(() => {
    const { from, to } = rangeDates(range)
    setLoading(true)
    const ac = new AbortController()
    ledgerClient
      .getExpenseTree({ from, to }, { signal: ac.signal })
      .then((d) => {
        setRows(d.rows ?? [])
        setPath([])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    return () => ac.abort()
  }, [range])

  const currencies = useMemo(() => [...new Set(rows.map((r) => r.currency))].sort(), [rows])
  // Derived so we never setState-in-effect: honour the user's pick when it's
  // present in the data, else default to INR, else the first currency.
  const activeCurrency = useMemo(
    () =>
      currencies.includes(currency)
        ? currency
        : currencies.includes('INR')
          ? 'INR'
          : (currencies[0] ?? 'INR'),
    [currencies, currency],
  )

  const tree = useMemo(
    () => buildTree(rows.filter((r) => r.currency === activeCurrency)),
    [rows, activeCurrency],
  )
  const node = useMemo(() => nodeAt(tree, path), [tree, path])

  const [boxRef, width] = useWidth()
  const height = 460

  // One d3 hierarchy for the current level — drives both the tiles and the list.
  const level = useMemo(() => {
    const h = hierarchy<Tree>(node, (d) => d.children)
      .sum((d) => Math.max(0, d.self))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    // treemap() mutates + returns the node typed with x0/y0/x1/y1.
    return treemap<Tree>().size([Math.max(width, 1), height]).paddingInner(2).round(true)(h)
  }, [node, width])

  const tiles = level.children ?? []
  const levelTotal = level.value ?? 0

  function drill(child: Tree) {
    if (child.children.length) setPath((p) => [...p, child.name])
  }

  return (
    <>
      <PlanToolbar
        meta={
          loading ? 'Loading…' : levelTotal > 0 ? `${fmt(levelTotal, activeCurrency)} total` : undefined
        }
      >
        <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={cn(
                'rounded px-2.5 py-1',
                range === r.key
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        {currencies.length > 1 ? (
          <Select value={activeCurrency} onValueChange={setCurrency}>
            <SelectTrigger className="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </PlanToolbar>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* Breadcrumb */}
        <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => setPath([])}
            className={cn(
              'rounded px-1.5 py-0.5 font-medium',
              path.length === 0 ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Expenses
          </button>
          {path.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="size-3.5 text-muted-foreground" />
              <button
                type="button"
                onClick={() => setPath(path.slice(0, i + 1))}
                className={cn(
                  'rounded px-1.5 py-0.5',
                  i === path.length - 1
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {seg}
              </button>
            </span>
          ))}
        </div>

        {tiles.length === 0 ? (
          <div className="flex h-[460px] items-center justify-center rounded-lg border border-border text-sm text-muted-foreground">
            {loading
              ? 'Loading…'
              : node.self > 0
                ? `${node.name} has no sub-categories — ${fmt(node.self, activeCurrency)} total.`
                : 'No expenses in this period.'}
          </div>
        ) : (
          <>
            {/* Treemap */}
            <div ref={boxRef} className="relative w-full overflow-hidden rounded-lg" style={{ height }}>
              {tiles.map((t) => {
                const w = (t.x1 ?? 0) - (t.x0 ?? 0)
                const h = (t.y1 ?? 0) - (t.y0 ?? 0)
                const pct = levelTotal > 0 ? ((t.value ?? 0) / levelTotal) * 100 : 0
                const drillable = t.data.children.length > 0
                const showLabel = w > 56 && h > 26
                return (
                  <button
                    key={t.data.full}
                    type="button"
                    onClick={() => drill(t.data)}
                    title={`${t.data.name} · ${fmt(t.value ?? 0, activeCurrency)} · ${pct.toFixed(1)}%`}
                    className={cn(
                      'absolute overflow-hidden border border-background/40 text-left text-background',
                      drillable ? 'cursor-pointer' : 'cursor-default',
                    )}
                    style={{
                      left: t.x0,
                      top: t.y0,
                      width: w,
                      height: h,
                      backgroundColor: colorFor(t.data.name),
                    }}
                  >
                    {showLabel ? (
                      <span className="block px-1.5 py-1 leading-tight">
                        <span className="block truncate text-[12px] font-medium">{t.data.name}</span>
                        {h > 42 ? (
                          <span className="block truncate text-[11px] opacity-80">
                            {fmt(t.value ?? 0, activeCurrency)}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            {/* Ranked list for the current level */}
            <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
              {tiles.map((t) => {
                const pct = levelTotal > 0 ? ((t.value ?? 0) / levelTotal) * 100 : 0
                const drillable = t.data.children.length > 0
                return (
                  <li key={t.data.full}>
                    <button
                      type="button"
                      onClick={() => drill(t.data)}
                      disabled={!drillable}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: colorFor(t.data.name) }}
                      />
                      <span className="min-w-0 flex-1 truncate text-foreground">{t.data.name}</span>
                      <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
                        {pct.toFixed(0)}%
                      </span>
                      <span className="w-28 shrink-0 text-right font-medium text-foreground">
                        {fmt(t.value ?? 0, activeCurrency)}
                      </span>
                      {drillable ? (
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <span className="size-4 shrink-0" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </>
  )
}
