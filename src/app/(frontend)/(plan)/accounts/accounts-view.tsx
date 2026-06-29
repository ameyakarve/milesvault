'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { hierarchy, treemap } from 'd3-hierarchy'
import { ChevronRight } from 'lucide-react'
import { ledgerClient } from '@/lib/ledger-client-browser'
import { SegmentedControl } from '@/components/shared'
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

const ACCOUNT_TYPES = ['Expenses', 'Income', 'Assets', 'Liabilities'] as const
type AccountType = (typeof ACCOUNT_TYPES)[number]

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

// Stable hue per category name — a cohesive mid-tone categorical palette,
// all dark enough for white tile labels (in light AND dark mode).
const PALETTE = [
  '#4e79a7', '#e1813c', '#5a9e5a', '#cf5b5b', '#8a6cbf', '#3fa39a',
  '#c2628a', '#b58a3e', '#6f8fc4', '#7d9e44', '#c06f4f', '#5aa1bf',
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

// Build the account hierarchy under `rootName` (Expenses/Income/Assets/…) from
// full account paths; each account's MAGNITUDE lands on its node (abs, so
// income/liability credits and negative balances size correctly), parents roll
// up via d3's .sum().
function buildTree(rows: Row[], rootName: string): Tree {
  const root: Tree = { name: rootName, full: rootName, self: 0, children: [] }
  const index = new Map<string, Tree>([[rootName, root]])
  for (const r of rows) {
    const segs = r.account.split(':')
    let parentFull = rootName
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
    if (exact) exact.self += Math.abs(r.total)
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

type Txn = { date: string; label: string; amount: string | null }
// Split a filtered-journal text blob into per-entry summaries (date, payee/
// narration, and the amount on the given account's posting line).
function parseTxns(text: string, account: string): Txn[] {
  if (!text.trim()) return []
  const out: Txn[] = []
  for (const block of text.trim().split(/\n(?=\d{4}-\d{2}-\d{2})/)) {
    const lines = block.split('\n')
    const m = /^(\d{4}-\d{2}-\d{2})\s+[*!]\s+(.*)$/.exec(lines[0] ?? '')
    if (!m) continue
    let amount: string | null = null
    for (const l of lines.slice(1)) {
      if (l.includes(account)) {
        const am = /-?[\d,]+\.?\d*/.exec(l.replace(account, ''))
        if (am) amount = am[0]
        break
      }
    }
    out.push({ date: m[1]!, label: m[2]!.replace(/"/g, ' ').replace(/\s+/g, ' ').trim(), amount })
  }
  return out
}
function editorHref(account: string, from: string, to: string): string {
  return `/editor?account=${encodeURIComponent(account)}&from=${from}&to=${to}`
}

// Callback ref so we measure the moment the (conditionally-rendered) treemap
// node mounts — a plain ref in a []-effect runs before the node exists and
// would stick at the default width forever.
function useWidth(): [(el: HTMLDivElement | null) => void, number] {
  const [w, setW] = useState(0)
  const roRef = useRef<ResizeObserver | null>(null)
  const measure = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!el) return
    const initial = el.getBoundingClientRect().width
    if (initial > 0) setW(initial)
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width
      if (cw && cw > 0) setW(cw)
    })
    ro.observe(el)
    roRef.current = ro
  }, [])
  return [measure, w]
}

export function AccountsView() {
  const [type, setType] = useState<AccountType>('Expenses')
  const [range, setRange] = useState<RangeKey>('3m')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [currency, setCurrency] = useState('INR')
  const [path, setPath] = useState<string[]>([])
  // Flow-sign + amount filters (also URL-parametrized for deep-linking):
  // sign keeps rows whose total is +ve / -ve; min/max bound |total|.
  const [sign, setSign] = useState<'all' | 'pos' | 'neg'>('all')
  const [minAmt, setMinAmt] = useState<number | null>(null)
  const [maxAmt, setMaxAmt] = useState<number | null>(null)

  // Income/Expenses explore FLOWS over the range; Assets/Liabilities explore
  // BALANCES as of the range end.
  const isFlow = type === 'Expenses' || type === 'Income'

  useEffect(() => {
    const { from, to } = rangeDates(range)
    setLoading(true)
    setError(null)
    const ac = new AbortController()
    const p: Promise<Row[]> = isFlow
      ? ledgerClient.getAccountFlows({ root: type, from, to }, { signal: ac.signal }).then((d) => d.rows ?? [])
      : ledgerClient.getAccountSummaries(to, { signal: ac.signal }).then((d) =>
          (d.rows ?? [])
            .filter((r) => r.account === type || r.account.startsWith(type + ':'))
            .map((r) => ({
              account: r.account,
              currency: r.currency,
              total: Number(r.balance_scaled) / 10 ** r.scale,
            })),
        )
    p.then((rs) => {
      // Don't reset the drill path here — the type/range pickers reset it, and a
      // URL-restored prefix path must survive the first load.
      setRows(rs)
    })
      .catch((e: unknown) => {
        if (ac.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    return () => ac.abort()
  }, [type, range, isFlow, reloadNonce])

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

  // ── deep-link: restore view from the URL on mount, reflect changes back ──────
  // prefix = `<Type>[:<sub>:<sub>…]` (e.g. Expenses:Transport:Fuel), plus range
  // and the sign / amount filters. Lets the concierge link straight to a spend
  // view instead of computing totals in chat.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const prefix = q.get('prefix') ?? q.get('root')
    if (prefix) {
      const [root, ...rest] = prefix.split(':')
      if ((ACCOUNT_TYPES as readonly string[]).includes(root)) {
        setType(root as AccountType)
        setPath(rest)
      }
    }
    const rng = q.get('range')
    if (rng && RANGES.some((r) => r.key === rng)) setRange(rng as RangeKey)
    const sg = q.get('sign')
    if (sg === 'pos' || sg === 'neg') setSign(sg)
    if (q.get('min') && Number.isFinite(Number(q.get('min')))) setMinAmt(Number(q.get('min')))
    if (q.get('max') && Number.isFinite(Number(q.get('max')))) setMaxAmt(Number(q.get('max')))
    const cur = q.get('cur')
    if (cur) setCurrency(cur)
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!hydrated) return
    const q = new URLSearchParams()
    const prefix = [type, ...path].join(':')
    if (prefix !== 'Expenses') q.set('prefix', prefix)
    if (range !== '3m') q.set('range', range)
    if (sign !== 'all') q.set('sign', sign)
    if (minAmt != null) q.set('min', String(minAmt))
    if (maxAmt != null) q.set('max', String(maxAmt))
    if (activeCurrency && activeCurrency !== 'INR') q.set('cur', activeCurrency)
    const qs = q.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [hydrated, type, path, range, sign, minAmt, maxAmt, activeCurrency])

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.currency === activeCurrency &&
          (sign === 'all' || (sign === 'pos' ? r.total > 0 : r.total < 0)) &&
          (minAmt == null || Math.abs(r.total) >= minAmt) &&
          (maxAmt == null || Math.abs(r.total) <= maxAmt),
      ),
    [rows, activeCurrency, sign, minAmt, maxAmt],
  )
  const tree = useMemo(() => buildTree(filteredRows, type), [filteredRows, type])
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

  // Always descend — including into a leaf, which switches to the transaction
  // list. (Previously this no-op'd on leaves, so the leaf view was unreachable.)
  function drill(child: Tree) {
    setPath((p) => [...p, child.name])
  }

  // Leaf = an account with no sub-categories (and not the synthetic root). At a
  // leaf we list the actual transactions and link them into the editor journal.
  const isLeaf = node.children.length === 0 && node.full !== type
  const { from: rangeFrom, to: rangeTo } = rangeDates(range)
  const [leafTxns, setLeafTxns] = useState<Txn[]>([])
  const [leafLoading, setLeafLoading] = useState(false)
  useEffect(() => {
    if (!isLeaf) {
      setLeafTxns([])
      return
    }
    setLeafLoading(true)
    const ac = new AbortController()
    ledgerClient
      .getJournalFiltered(
        { account: node.full, dateFrom: rangeFrom, dateTo: rangeTo, limit: 200 },
        { signal: ac.signal },
      )
      .then((d) => setLeafTxns(parseTxns(d.text ?? '', node.full)))
      .catch(() => {})
      .finally(() => setLeafLoading(false))
    return () => ac.abort()
  }, [isLeaf, node.full, rangeFrom, rangeTo])

  return (
    <>
      <PlanToolbar
        meta={
          loading ? 'Loading…' : levelTotal > 0 ? `${fmt(levelTotal, activeCurrency)} total` : undefined
        }
      >
        <SegmentedControl
          options={ACCOUNT_TYPES.map((t) => ({ value: t, label: t }))}
          value={type}
          onChange={(t) => {
            setType(t)
            setPath([])
          }}
        />
        {isFlow ? (
          <SegmentedControl
            options={RANGES.map((r) => ({ value: r.key, label: r.label }))}
            value={range}
            onChange={(r) => {
              setRange(r)
              setPath([])
            }}
          />
        ) : (
          <span className="text-xs text-muted-foreground">balance as of today</span>
        )}
        <SegmentedControl
          options={[
            { value: 'all', label: 'All' },
            { value: 'pos', label: '+' },
            { value: 'neg', label: '−' },
          ]}
          value={sign}
          onChange={(v) => setSign(v as 'all' | 'pos' | 'neg')}
        />
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

      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        {/* Breadcrumb */}
        <div className="mb-3 flex flex-wrap items-center gap-1 px-4 text-sm">
          <button
            type="button"
            onClick={() => setPath([])}
            className={cn(
              'rounded px-1.5 py-0.5 font-medium',
              path.length === 0 ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {type}
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

        {tiles.length === 0 && isLeaf ? (
          // Bottom level: list the actual transactions, each linking into the
          // editor journal (filtered to this account + range).
          <div className="mx-4 rounded-lg border border-border">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
              <span className="text-sm font-medium text-foreground">
                {node.name}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {leafTxns.length} txn{leafTxns.length === 1 ? '' : 's'} · {fmt(node.self, activeCurrency)}
                </span>
              </span>
              <a
                href={editorHref(node.full, rangeFrom, rangeTo)}
                className="shrink-0 text-xs font-medium text-foreground underline underline-offset-4 hover:no-underline"
              >
                Open in editor →
              </a>
            </div>
            {leafLoading ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">Loading…</p>
            ) : leafTxns.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                No transactions in this period.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {leafTxns.map((t, i) => (
                  <li key={i}>
                    <a
                      href={editorHref(node.full, rangeFrom, rangeTo)}
                      className="flex items-center gap-3 px-3 py-2 text-[13px] hover:bg-muted/60"
                    >
                      <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground">
                        {t.date}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-foreground">{t.label}</span>
                      {t.amount ? (
                        <span className="shrink-0 font-medium text-foreground">
                          {fmt(Number(t.amount.replace(/,/g, '')) || 0, activeCurrency)}
                        </span>
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : error ? (
          <div
            role="alert"
            className="mx-4 flex h-[460px] flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive"
          >
            <span>Couldn’t load accounts: {error}</span>
            <button
              type="button"
              onClick={() => setReloadNonce((n) => n + 1)}
              className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
            >
              Try again
            </button>
          </div>
        ) : tiles.length === 0 ? (
          <div className="mx-4 flex h-[460px] items-center justify-center rounded-lg border border-border text-sm text-muted-foreground">
            {loading ? 'Loading…' : `No ${type.toLowerCase()} in this period.`}
          </div>
        ) : (
          <>
            {/* Treemap */}
            <div ref={boxRef} className="relative w-full overflow-hidden" style={{ height }}>
              {tiles.map((t) => {
                const w = (t.x1 ?? 0) - (t.x0 ?? 0)
                const h = (t.y1 ?? 0) - (t.y0 ?? 0)
                const pct = levelTotal > 0 ? ((t.value ?? 0) / levelTotal) * 100 : 0
                const showLabel = w > 56 && h > 26
                return (
                  <button
                    key={t.data.full}
                    type="button"
                    onClick={() => drill(t.data)}
                    title={`${t.data.name} · ${fmt(t.value ?? 0, activeCurrency)} · ${pct.toFixed(1)}%`}
                    className="absolute cursor-pointer overflow-hidden rounded-sm border border-black/10 text-left text-white"
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
            <ul className="mx-4 mt-4 divide-y divide-border rounded-lg border border-border">
              {tiles.map((t) => {
                const pct = levelTotal > 0 ? ((t.value ?? 0) / levelTotal) * 100 : 0
                const drillable = t.data.children.length > 0
                return (
                  <li key={t.data.full}>
                    <button
                      type="button"
                      onClick={() => drill(t.data)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] hover:bg-muted/60"
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
