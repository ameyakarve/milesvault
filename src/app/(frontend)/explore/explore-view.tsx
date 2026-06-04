'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, Loader2, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type {
  AwardExploreResult,
  ExploreAirline,
} from '@/durable/agents/tools/concierge/award-explore'
import type { AwardPlanRow } from '@/durable/agents/tools/concierge/award-plan'

type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
type Stops = 'all' | '0' | '1'

const CABIN_TABS: { key: Cabin; label: string }[] = [
  { key: 'economy', label: 'Economy' },
  { key: 'premium_economy', label: 'Premium' },
  { key: 'business', label: 'Business' },
  { key: 'first', label: 'First' },
]

// v1 funding sources — resolved server-side by name. "Held-account auto-detect"
// is a later pass; for now a small curated set + miles-only.
const SOURCE_OPTIONS: { label: string; value: string }[] = [
  { label: 'Miles only — no card', value: '' },
  { label: 'Axis Magnus · EDGE Burgundy', value: 'EDGE Rewards Burgundy' },
  { label: 'Axis Reserve / Magnus · EDGE', value: 'EDGE Rewards Magnus' },
  { label: 'HDFC Infinia', value: 'HDFC Infinia' },
  { label: 'ICICI Emeralde', value: 'ICICI Emeralde' },
]

const fmt = (n: number) => n.toLocaleString('en-US')
const fmtK = (n: number) =>
  n >= 1000 ? `${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : String(n)

// "currency/edge-rewards-burgundy" → "Edge Rewards Burgundy"
function prettySlug(slug: string): string {
  return slug
    .replace(/^[a-z]+\//, '')
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function routingLabel(row: AwardPlanRow): { head: string; carriers: string; extra: string } {
  const first = row.routings[0]
  const carriers = first ? first.carriers.join('·') : ''
  const head = row.stops === 0 ? 'Direct' : `1-stop via ${first?.hub ?? '?'}`
  const extra = row.routings.length > 1 ? `+${row.routings.length - 1}` : ''
  return { head, carriers, extra }
}

const rowKey = (r: AwardPlanRow, i: number) => `${r.programme}|${r.stops}|${i}`

// Numeric sort/display value for a cabin on a row: points cost if the row is
// costed, else the programme's own miles. Infinity → sorts last.
function primaryValue(row: AwardPlanRow, cabin: Cabin): number {
  const c = row.cost[cabin]
  if (Array.isArray(c)) return c[0]
  const m = row.miles[cabin]
  if (Array.isArray(m)) return m[0]
  return Number.POSITIVE_INFINITY
}

function CabinFigure({ row, cabin }: { row: AwardPlanRow; cabin: Cabin }) {
  const cost = row.cost[cabin]
  const miles = row.miles[cabin]
  if (cost === 'dynamic' || miles === 'dynamic')
    return <span className="text-amber-600">varies</span>
  if (Array.isArray(cost)) {
    const pts = cost[0] === cost[1] ? fmt(cost[0]) : `${fmt(cost[0])}–${fmt(cost[1])}`
    return (
      <span className="font-mono">
        {pts}
        <span className="ml-1 text-[11px] font-normal text-slate-400">pts</span>
        {Array.isArray(miles) ? (
          <span className="block text-[11px] font-normal text-slate-400">{fmtK(miles[0])} mi</span>
        ) : null}
      </span>
    )
  }
  if (Array.isArray(miles))
    return <span className="font-mono text-slate-500">{fmtK(miles[0])} mi</span>
  return <span className="text-slate-300">—</span>
}

function TransferPath({ row, source }: { row: AwardPlanRow; source: string }) {
  if (row.multiplier === 1)
    return <span className="text-slate-500">{prettySlug(row.programme)} — already held</span>
  if (!row.reachable)
    return (
      <span className="italic text-slate-400">
        {source ? 'not reachable from this card' : 'pick a card to cost this in points'}
      </span>
    )
  return (
    <span className="text-slate-500">
      {row.path.map(prettySlug).join(' → ')}
      <span className="text-slate-700">
        {' '}
        · {row.multiplier}× · {row.hops} hop{row.hops === 1 ? '' : 's'}
      </span>
    </span>
  )
}

// ---- Filters (shared between the desktop rail and the mobile dialog) ----

type FilterState = {
  airlines: ExploreAirline[]
  excluded: Set<string>
  toggleAirline: (iata: string) => void
  stops: Stops
  setStops: (s: Stops) => void
  source: string
  setSource: (s: string) => void
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </div>
  )
}

function Filters({ f }: { f: FilterState }) {
  return (
    <div className="space-y-6">
      <Section title="Transfer from">
        <select
          value={f.source}
          onChange={(e) => f.setSource(e.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700"
        >
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Section>

      <Section title="Airlines">
        <div className="space-y-1.5">
          {f.airlines.length === 0 ? (
            <p className="text-xs text-slate-400">—</p>
          ) : (
            f.airlines.map((a) => {
              const on = !f.excluded.has(a.iata)
              return (
                <label key={a.iata} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => f.toggleAirline(a.iata)}
                    className="size-3.5 rounded border-slate-300 text-teal-500 focus:ring-teal-500"
                  />
                  <span className="text-slate-600">
                    <span className="font-mono text-xs text-slate-400">{a.iata}</span> {a.name}
                  </span>
                </label>
              )
            })
          )}
        </div>
      </Section>

      <Section title="Stops">
        <div className="flex gap-1.5">
          {(['all', '0', '1'] as Stops[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => f.setStops(s)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs transition-colors',
                f.stops === s
                  ? 'border-teal-500 bg-teal-500 text-white'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
              )}
            >
              {s === 'all' ? 'Any' : s === '0' ? 'Nonstop' : '1-stop'}
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ---- Results ----

function ResultRows({
  rows,
  cabin,
  source,
  expanded,
  toggle,
  variant,
}: {
  rows: AwardPlanRow[]
  cabin: Cabin
  source: string
  expanded: Set<string>
  toggle: (k: string) => void
  variant: 'card' | 'row'
}) {
  if (variant === 'card') {
    return (
      <div className="space-y-2.5">
        {rows.map((row, i) => {
          const k = rowKey(row, i)
          const rl = routingLabel(row)
          const open = expanded.has(k)
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              className="block w-full rounded-xl border border-slate-200 bg-white p-4 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-serif text-lg text-slate-800">
                    {prettySlug(row.programme)}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {rl.head} ·{' '}
                    <span className={cn(row.own_metal && 'font-semibold text-slate-700')}>
                      {rl.carriers}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right text-base">
                  <CabinFigure row={row} cabin={cabin} />
                </div>
              </div>
              {open ? (
                <div className="mt-3 border-t border-slate-100 pt-2 text-[11px]">
                  <TransferPath row={row} source={source} />
                </div>
              ) : null}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
          <th className="py-2 pl-4 pr-3 font-medium">Routing</th>
          <th className="px-3 py-2 font-medium">Programme</th>
          <th className="px-3 py-2 text-right font-medium">{CABIN_TABS.find((c) => c.key === cabin)?.label}</th>
          <th className="w-8" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const k = rowKey(row, i)
          const rl = routingLabel(row)
          const open = expanded.has(k)
          return (
            <Fragment key={k}>
              <tr
                onClick={() => toggle(k)}
                className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="py-3 pl-4 pr-3 align-top">
                  <div className="text-slate-700">{rl.head}</div>
                  <div
                    className={cn(
                      'text-xs text-slate-400',
                      row.own_metal && 'font-semibold text-slate-600',
                    )}
                  >
                    {rl.carriers}
                    {rl.extra ? <span className="text-slate-400"> {rl.extra}</span> : null}
                  </div>
                </td>
                <td className="px-3 py-3 align-top font-serif text-slate-800">
                  {prettySlug(row.programme)}
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <CabinFigure row={row} cabin={cabin} />
                </td>
                <td className="pr-4 align-top">
                  <ChevronDown
                    className={cn(
                      'mt-3 size-4 text-slate-300 transition-transform',
                      open && 'rotate-180',
                    )}
                  />
                </td>
              </tr>
              {open ? (
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <td colSpan={4} className="px-4 py-2 text-[11px]">
                    <TransferPath row={row} source={source} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

// ---- Main view ----

const isIata = (s: string) => /^[A-Z]{3}$/.test(s)

export function ExploreView() {
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [source, setSource] = useState('')
  const [cabin, setCabin] = useState<Cabin>('business')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [stops, setStops] = useState<Stops>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Hydrate from the URL once on mount. Done in an effect (not a lazy state
  // initializer) so server and first client render agree on defaults — reading
  // window during render would hydration-mismatch on deep-linked params.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const q = new URLSearchParams(window.location.search)
    const o = (q.get('origin') ?? '').toUpperCase()
    const d = (q.get('destination') ?? '').toUpperCase()
    if (o) setOrigin(o)
    if (d) setDestination(d)
    if (q.get('source')) setSource(q.get('source') as string)
    const c = q.get('cabin') as Cabin | null
    if (c && CABIN_TABS.some((t) => t.key === c)) setCabin(c)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  // Reflect the core state back into the URL (no reload).
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
    let r = data.rows
    // Only options that offer the chosen cabin.
    r = r.filter((x) => x.miles[cabin] != null)
    if (stops !== 'all') r = r.filter((x) => String(x.stops) === stops)
    if (excluded.size)
      r = r.filter((x) => !(x.routings[0]?.carriers ?? []).some((c) => excluded.has(c)))
    return [...r].sort((a, b) => primaryValue(a, cabin) - primaryValue(b, cabin))
  }, [data, cabin, stops, excluded])

  const filterState: FilterState = {
    airlines,
    excluded,
    toggleAirline,
    stops,
    setStops,
    source,
    setSource,
  }

  const unresolvedSource = source && data && !data.source_currency

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search header */}
      <header className="sticky top-0 z-10 shrink-0 border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
          <h1 className="font-serif text-xl font-semibold text-slate-800 sm:mr-2">
            Award Explorer
          </h1>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
            <input
              value={origin}
              onChange={(e) => setOrigin(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="BLR"
              aria-label="Origin airport"
              className="w-14 bg-transparent text-center font-mono text-sm uppercase tracking-wide text-slate-700 outline-none placeholder:text-slate-300"
            />
            <ArrowRight className="size-4 text-slate-300" />
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="NRT"
              aria-label="Destination airport"
              className="w-14 bg-transparent text-center font-mono text-sm uppercase tracking-wide text-slate-700 outline-none placeholder:text-slate-300"
            />
          </div>

          {/* Cabin segmented control */}
          <div className="flex overflow-x-auto rounded-lg border border-slate-200 p-0.5 sm:ml-auto">
            {CABIN_TABS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCabin(c.key)}
                className={cn(
                  'whitespace-nowrap rounded-md px-3 py-1 text-xs transition-colors',
                  cabin === c.key
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Mobile filters trigger */}
          <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
            <DialogTrigger className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 md:hidden">
              <SlidersHorizontal className="size-3.5" />
              Filters
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Filters</DialogTitle>
              </DialogHeader>
              <Filters f={filterState} />
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 gap-6 overflow-hidden px-4">
        {/* Desktop filter rail */}
        <aside className="hidden w-56 shrink-0 overflow-y-auto py-5 md:block">
          <Filters f={filterState} />
        </aside>

        {/* Results */}
        <section className="min-w-0 flex-1 overflow-y-auto py-5">
          {!ready ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-20 text-center text-slate-400">
              <p className="text-sm">Enter an origin and destination (IATA codes) to explore award options.</p>
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="size-4 animate-spin" />
              Pricing every routing and programme…
            </div>
          ) : error ? (
            <p className="py-6 text-sm text-red-600">Couldn’t load options: {error}</p>
          ) : !data || data.rows.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">
              No direct or one-stop award options found for {origin} → {destination}.
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
                <span>
                  {rows.length} option{rows.length === 1 ? '' : 's'} · {origin} → {destination}
                </span>
                <span>sorted by {CABIN_TABS.find((c) => c.key === cabin)?.label} cost</span>
              </div>
              {unresolvedSource ? (
                <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                  Couldn’t match “{source}” to a card currency — showing miles only.
                </p>
              ) : null}

              {/* Mobile cards */}
              <div className="md:hidden">
                <ResultRows
                  rows={rows}
                  cabin={cabin}
                  source={source}
                  expanded={expanded}
                  toggle={toggleExpanded}
                  variant="card"
                />
              </div>
              {/* Desktop table */}
              <div className="hidden rounded-xl border border-slate-200 bg-white md:block">
                <ResultRows
                  rows={rows}
                  cabin={cabin}
                  source={source}
                  expanded={expanded}
                  toggle={toggleExpanded}
                  variant="row"
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
