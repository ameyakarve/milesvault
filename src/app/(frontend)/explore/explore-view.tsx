'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, Loader2, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type {
  AwardExploreResult,
  ExploreAirline,
} from '@/durable/agents/tools/concierge/award-explore'
import type { AwardPlanRow } from '@/durable/agents/tools/concierge/award-plan'

// Styled to the existing app theme (editor / concierge): Inter, slate palette,
// thin slate borders, rounded-md, JetBrains-mono for figures. No serif, no
// headings, no heavy rounding.

type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
type Stops = 'all' | '0' | '1'

const CABIN_TABS: { key: Cabin; label: string }[] = [
  { key: 'economy', label: 'Economy' },
  { key: 'premium_economy', label: 'Premium' },
  { key: 'business', label: 'Business' },
  { key: 'first', label: 'First' },
]

const SOURCE_OPTIONS: { label: string; value: string }[] = [
  { label: 'Axis Magnus · EDGE Burgundy', value: 'EDGE Rewards Burgundy' },
  { label: 'Axis Reserve / Magnus · EDGE', value: 'EDGE Rewards Magnus' },
  { label: 'HDFC Infinia', value: 'HDFC Infinia' },
  { label: 'ICICI Emeralde', value: 'ICICI Emeralde' },
]

const fmt = (n: number) => n.toLocaleString('en-US')
const fmtK = (n: number) =>
  n >= 1000 ? `${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : String(n)

function prettySlug(slug: string): string {
  return slug
    .replace(/^[a-z]+\//, '')
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

const rowKey = (r: AwardPlanRow, i: number) => `${r.programme}|${r.stops}|${i}`

function primaryValue(row: AwardPlanRow, cabin: Cabin): number {
  const c = row.cost[cabin]
  if (Array.isArray(c)) return c[0]
  const m = row.miles[cabin]
  if (Array.isArray(m)) return m[0]
  return Number.POSITIVE_INFINITY
}

function pathSegments(row: AwardPlanRow): string[] {
  return row.path.map(prettySlug)
}

// A cabin cell: points cost (primary, when costed) + raw miles (secondary), or
// miles only when not costed.
function Figure({ row, cabin }: { row: AwardPlanRow; cabin: Cabin }) {
  const cost = row.cost[cabin]
  const miles = row.miles[cabin]
  if (cost === 'dynamic' || miles === 'dynamic')
    return <span className="font-mono text-sm text-amber-600">varies</span>
  if (Array.isArray(cost)) {
    const pts = cost[0] === cost[1] ? fmt(cost[0]) : `${fmt(cost[0])}–${fmt(cost[1])}`
    return (
      <span className="font-mono tabular-nums">
        <span className="text-sm text-slate-900">{pts}</span>
        {Array.isArray(miles) ? (
          <span className="ml-1.5 text-xs text-slate-400">{fmtK(miles[0])} mi</span>
        ) : null}
      </span>
    )
  }
  if (Array.isArray(miles))
    return <span className="font-mono text-sm tabular-nums text-slate-500">{fmtK(miles[0])} mi</span>
  return <span className="text-slate-300">—</span>
}

function TransferPath({ row, source }: { row: AwardPlanRow; source: string }) {
  if (row.multiplier === 1)
    return <span className="text-slate-500">{prettySlug(row.programme)} — already held</span>
  if (!row.reachable)
    return (
      <span className="italic text-slate-400">
        {source ? 'not reachable from this card' : 'pick a card to cost in points'}
      </span>
    )
  return (
    <span className="text-slate-500">
      {pathSegments(row).join(' → ')}
      <span className="text-slate-700">
        {' '}
        · {row.multiplier}× · {row.hops} hop{row.hops === 1 ? '' : 's'}
      </span>
    </span>
  )
}

// ── filters (reused in desktop rail + mobile sheet) ──

type FilterState = {
  airlines: ExploreAirline[]
  excluded: Set<string>
  toggleAirline: (iata: string) => void
  stops: Stops
  setStops: (s: Stops) => void
  source: string
  setSource: (s: string) => void
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: React.ReactNode
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-3.5 rounded border-slate-300 accent-slate-900"
      />
      {label}
    </label>
  )
}

function Filters({ f }: { f: FilterState }) {
  return (
    <div className="space-y-5">
      <FilterGroup title="Transfer from">
        {SOURCE_OPTIONS.map((o) => (
          <Check
            key={o.value}
            label={o.label}
            checked={f.source === o.value}
            onChange={() => f.setSource(f.source === o.value ? '' : o.value)}
          />
        ))}
      </FilterGroup>
      <FilterGroup title="Airlines">
        {f.airlines.length === 0 ? (
          <p className="text-xs text-slate-400">—</p>
        ) : (
          f.airlines.map((a) => (
            <Check
              key={a.iata}
              label={
                <span>
                  <span className="font-mono text-xs text-slate-400">{a.iata}</span> {a.name}
                </span>
              }
              checked={!f.excluded.has(a.iata)}
              onChange={() => f.toggleAirline(a.iata)}
            />
          ))
        )}
      </FilterGroup>
      <FilterGroup title="Stops">
        {(
          [
            ['all', 'Any'],
            ['0', 'Nonstop'],
            ['1', '1-stop'],
          ] as [Stops, string][]
        ).map(([v, label]) => (
          <Check key={v} label={label} checked={f.stops === v} onChange={() => f.setStops(v)} />
        ))}
      </FilterGroup>
    </div>
  )
}

// ── routing label ──
function routingText(row: AwardPlanRow): string {
  const r = row.routings[0]
  if (!r) return ''
  return row.stops === 0 ? 'Direct' : `1-stop · ${r.hub ?? '?'}`
}

const isIata = (s: string) => /^[A-Z]{3}$/.test(s)

export function ExploreView() {
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [source, setSource] = useState('EDGE Rewards Burgundy')
  const [cabin, setCabin] = useState<Cabin>('business')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [stops, setStops] = useState<Stops>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const q = new URLSearchParams(window.location.search)
    const o = (q.get('origin') ?? '').toUpperCase()
    const d = (q.get('destination') ?? '').toUpperCase()
    if (o) setOrigin(o)
    if (d) setDestination(d)
    if (q.get('source') != null) setSource(q.get('source') as string)
    const c = q.get('cabin') as Cabin | null
    if (c && CABIN_TABS.some((t) => t.key === c)) setCabin(c)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    const q = new URLSearchParams()
    if (origin) q.set('origin', origin)
    if (destination) q.set('destination', destination)
    if (source) q.set('source', source)
    q.set('cabin', cabin)
    const qs = q.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [origin, destination, source, cabin])

  const ready = isIata(origin) && isIata(destination)
  const reqKey = `${origin}|${destination}|${source}`
  const [result, setResult] = useState<{
    key: string
    data?: AwardExploreResult
    error?: string
  } | null>(null)

  useEffect(() => {
    if (!ready) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResult(null)
      return
    }
    let cancelled = false
    const handle = setTimeout(() => {
      const q = new URLSearchParams({ origin, destination })
      if (source) q.set('source', source)
      fetch(`/api/concierge/award-explore?${q.toString()}`)
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`)
          return (await r.json()) as AwardExploreResult
        })
        .then((d) => !cancelled && setResult({ key: reqKey, data: d }))
        .catch(
          (e) =>
            !cancelled &&
            setResult({ key: reqKey, error: e instanceof Error ? e.message : String(e) }),
        )
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey, ready])

  const loading = ready && (!result || result.key !== reqKey)
  const data = result?.key === reqKey ? result.data : undefined
  const error = result?.key === reqKey ? result.error : undefined
  const airlines = data?.airlines ?? []

  const toggleAirline = useCallback((iata: string) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(iata)) next.delete(iata)
      else next.add(iata)
      return next
    })
  }, [])
  const toggleExpanded = useCallback((k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    let r = data.rows.filter((x) => x.miles[cabin] != null)
    if (stops !== 'all') r = r.filter((x) => String(x.stops) === stops)
    if (excluded.size)
      r = r.filter((x) => !(x.routings[0]?.carriers ?? []).some((c) => excluded.has(c)))
    return [...r].sort((a, b) => primaryValue(a, cabin) - primaryValue(b, cabin))
  }, [data, cabin, stops, excluded])

  const f: FilterState = { airlines, excluded, toggleAirline, stops, setStops, source, setSource }
  const unresolvedSource = source && data && !data.source_currency

  const iataInput = (value: string, set: (v: string) => void, placeholder: string) => (
    <input
      value={value}
      onChange={(e) => set(e.target.value.toUpperCase().slice(0, 3))}
      placeholder={placeholder}
      className="w-12 bg-transparent text-center font-mono text-sm uppercase tracking-wide text-slate-800 outline-none placeholder:text-slate-300"
    />
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fbfbfa]">
      {/* Header */}
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1">
          {iataInput(origin, setOrigin, 'BLR')}
          <ArrowRight className="size-3.5 text-slate-300" />
          {iataInput(destination, setDestination, 'NRT')}
        </div>

        <div className="flex rounded-md border border-slate-200 p-0.5">
          {CABIN_TABS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCabin(c.key)}
              className={cn(
                'rounded px-2.5 py-1 text-xs transition-colors',
                cabin === c.key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 md:hidden"
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
        </button>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-4 py-4 md:block">
          <Filters f={f} />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-6 py-4">
            {!ready ? (
              <p className="py-16 text-center text-sm text-slate-400">
                Enter an origin and destination to see award options.
              </p>
            ) : loading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-slate-400">
                <Loader2 className="size-4 animate-spin" />
                Pricing every routing and programme…
              </div>
            ) : error ? (
              <p className="py-6 text-sm text-red-600">Couldn’t load options: {error}</p>
            ) : !data || rows.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">
                No award options found for {origin} → {destination}.
              </p>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {rows.length} option{rows.length === 1 ? '' : 's'}
                  </span>
                  <span>cheapest first</span>
                </div>
                {unresolvedSource ? (
                  <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Couldn’t match “{source}” to a card — showing miles only.
                  </p>
                ) : null}

                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
                        <th className="px-4 py-2 font-medium">Programme</th>
                        <th className="px-4 py-2 font-medium">Routing</th>
                        <th className="px-4 py-2 text-right font-medium">
                          {CABIN_TABS.find((c) => c.key === cabin)?.label}
                        </th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => {
                        const k = rowKey(row, i)
                        const open = expanded.has(k)
                        return (
                          <Fragment key={k}>
                            <tr
                              onClick={() => toggleExpanded(k)}
                              className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                            >
                              <td className="px-4 py-2.5 font-medium text-slate-800">
                                {prettySlug(row.programme)}
                              </td>
                              <td className="px-4 py-2.5 text-slate-500">
                                {routingText(row)}
                                {row.own_metal ? (
                                  <span className="ml-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">
                                    own metal
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <Figure row={row} cabin={cabin} />
                              </td>
                              <td className="pr-3">
                                <ChevronDown
                                  className={cn(
                                    'size-4 text-slate-300 transition-transform',
                                    open && 'rotate-180',
                                  )}
                                />
                              </td>
                            </tr>
                            {open ? (
                              <tr className="border-b border-slate-100 bg-slate-50/60 last:border-0">
                                <td colSpan={4} className="px-4 py-2 text-xs">
                                  <TransferPath row={row} source={source} />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {/* Mobile filters */}
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Filters</DialogTitle>
          </DialogHeader>
          <Filters f={f} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
