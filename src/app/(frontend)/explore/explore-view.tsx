'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type {
  AwardExploreResult,
  ExploreAirline,
} from '@/durable/agents/tools/concierge/award-explore'
import type { AwardPlanRow } from '@/durable/agents/tools/concierge/award-plan'

// ───────────────────────────────────────────────────────────────────────────
// Faithful port of the approved Stitch screens. Tokens (hex, type scale,
// spacing) are taken verbatim from the Stitch tailwind-config; reproduced as
// inline arbitrary values so nothing collides with the app's shadcn tokens.
//   primary #091426 · on-surface #191c1e · on-surface-variant #45474c
//   outline #75777d · outline-variant #c5c6cd · surface/bg #f7f9fb
//   surface-container-lowest (cards) #ffffff · surface-container-low #f2f4f6
// Type: headline-md = Fraunces 24/1.3/500 · headline-lg = Fraunces 40/1.2/600
//   data-display = JetBrains 18/1/600 · data-label = JetBrains 12/1/500
//   body-md = Inter 16/1.5 · label-sm = Inter 13/1/500
// ───────────────────────────────────────────────────────────────────────────

const T = {
  headlineMd: 'font-serif text-[24px] leading-[1.3] font-medium',
  headlineLg: 'font-serif text-[40px] leading-[1.2] tracking-[-0.02em] font-semibold',
  dataDisplay: 'font-mono text-[18px] leading-none tracking-[-0.01em] font-semibold',
  dataLabel: 'font-mono text-[12px] leading-none font-medium',
  bodyMd: 'font-sans text-[16px] leading-[1.5]',
  labelSm: 'font-sans text-[13px] leading-none font-medium',
}

function MS({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn('material-symbols-outlined', className)}
      style={{ fontVariationSettings: "'FILL' 0" }}
    >
      {name}
    </span>
  )
}

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

// Big cost figure + small "(Xk mi)" exactly like the mock. Points when costed,
// else the programme's own miles as the headline.
function figure(row: AwardPlanRow, cabin: Cabin): { big: string; small: string | null } {
  const cost = row.cost[cabin]
  const miles = row.miles[cabin]
  if (cost === 'dynamic' || miles === 'dynamic') return { big: 'varies', small: null }
  if (Array.isArray(cost)) {
    const big = cost[0] === cost[1] ? fmt(cost[0]) : `${fmt(cost[0])}–${fmt(cost[1])}`
    return { big, small: Array.isArray(miles) ? `(${fmtK(miles[0])} mi)` : null }
  }
  if (Array.isArray(miles)) return { big: `${fmtK(miles[0])} mi`, small: null }
  return { big: '—', small: null }
}

// The transfer-path breadcrumb segments, e.g. ["EDGE Burgundy","Asia Miles"].
function pathSegments(row: AwardPlanRow): string[] {
  return row.path.map(prettySlug)
}
function complexityLabel(row: AwardPlanRow): string {
  if (row.hops == null) return ''
  return row.hops <= 1 ? 'direct' : `${row.hops} hops`
}

// ── dotted O—D connector (verbatim from the mock) ──
function RouteDots() {
  return (
    <div className="relative h-px w-12 bg-[#c5c6cd]">
      <div className="absolute -left-0.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-[#c5c6cd]" />
      <div className="absolute -right-0.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-[#c5c6cd]" />
    </div>
  )
}

// ── cabin pills (mock mobile style; reused on desktop header) ──
function CabinPills({ cabin, setCabin }: { cabin: Cabin; setCabin: (c: Cabin) => void }) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto">
      {CABIN_TABS.map((c) => {
        const on = cabin === c.key
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => setCabin(c.key)}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full px-4 py-2',
              T.labelSm,
              on
                ? 'border-[#091426] bg-[#091426] font-bold text-white'
                : 'border border-[#c5c6cd] bg-white text-[#45474c]',
            )}
          >
            {c.label}
          </button>
        )
      })}
    </div>
  )
}

// ───────────────────────── Filters (checkbox lists, mock style) ─────────────

type FilterState = {
  airlines: ExploreAirline[]
  excluded: Set<string>
  toggleAirline: (iata: string) => void
  stops: Stops
  setStops: (s: Stops) => void
  source: string
  setSource: (s: string) => void
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
    <label className="group flex cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-4 rounded border-[#c5c6cd] text-[#091426] focus:ring-[#091426]"
      />
      <span className={cn(T.bodyMd, 'text-[#191c1e] transition-colors group-hover:text-[#091426]')}>
        {label}
      </span>
    </label>
  )
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className={cn(T.labelSm, 'mb-4 uppercase tracking-wider text-[#45474c]')}>{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

function FilterBody({ f }: { f: FilterState }) {
  return (
    <>
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
      <div className="h-px w-full bg-[#c5c6cd]/50" />
      <FilterGroup title="Airlines">
        {f.airlines.length === 0 ? (
          <p className={cn(T.labelSm, 'text-[#45474c]')}>—</p>
        ) : (
          f.airlines.map((a) => (
            <Check
              key={a.iata}
              label={
                <>
                  <span className="font-mono text-xs text-[#75777d]">{a.iata}</span> {a.name}
                </>
              }
              checked={!f.excluded.has(a.iata)}
              onChange={() => f.toggleAirline(a.iata)}
            />
          ))
        )}
      </FilterGroup>
      <div className="h-px w-full bg-[#c5c6cd]/50" />
      <FilterGroup title="Stops">
        {(
          [
            ['all', 'Any'],
            ['0', 'Non-stop'],
            ['1', '1 Stop'],
          ] as [Stops, string][]
        ).map(([v, label]) => (
          <Check key={v} label={label} checked={f.stops === v} onChange={() => f.setStops(v)} />
        ))}
      </FilterGroup>
    </>
  )
}

// ───────────────────────── Result cards ─────────────────────────

function TransferLine({ row, source }: { row: AwardPlanRow; source: string }) {
  if (row.multiplier === 1)
    return (
      <div className={cn('flex flex-wrap items-center gap-1', T.labelSm, 'text-[#45474c]')}>
        <span className="font-semibold text-[#091426]">{prettySlug(row.programme)} (held)</span>
        <span className="mx-1">·</span>
        <span>already have these</span>
      </div>
    )
  if (!row.reachable)
    return (
      <div className={cn(T.labelSm, 'italic text-[#75777d]')}>
        {source ? 'not reachable from this card' : 'pick a card to cost this in points'}
      </div>
    )
  const segs = pathSegments(row)
  return (
    <div className={cn('flex flex-wrap items-center gap-1', T.labelSm, 'text-[#45474c]')}>
      {segs.map((s, i) => (
        <Fragment key={i}>
          {i === 0 ? <span className="font-semibold text-[#091426]">{s}</span> : <span>{s}</span>}
          {i < segs.length - 1 ? <MS name="arrow_right_alt" className="text-[14px]" /> : null}
        </Fragment>
      ))}
    </div>
  )
}

// Mobile card — verbatim structure from mobile2.html.
function MobileCard({
  row,
  origin,
  destination,
  cabin,
  source,
  open,
  toggle,
}: {
  row: AwardPlanRow
  origin: string
  destination: string
  cabin: Cabin
  source: string
  open: boolean
  toggle: () => void
}) {
  const fig = figure(row, cabin)
  const expandable = row.reachable && row.multiplier !== 1
  return (
    <div
      className={cn(
        'rounded-lg border border-[#c5c6cd] bg-white p-4 transition-shadow hover:shadow-sm',
        !row.reachable && source ? 'opacity-80' : '',
      )}
    >
      <div className="mb-2 flex items-start justify-between">
        <h3 className={cn(T.headlineMd, 'text-[#191c1e]')}>{prettySlug(row.programme)}</h3>
        <div className="text-right">
          <div className={cn(T.dataDisplay, 'text-[#091426]')}>{fig.big}</div>
          {fig.small ? (
            <div className={cn(T.dataLabel, 'mt-1 text-[#45474c]')}>{fig.small}</div>
          ) : null}
        </div>
      </div>
      <div className="mb-4 flex items-center gap-2">
        <span className={cn(T.bodyMd, 'text-[#191c1e]')}>{origin}</span>
        <RouteDots />
        <span className={cn(T.bodyMd, 'text-[#191c1e]')}>{destination}</span>
        {row.stops === 1 && row.routings[0]?.hub ? (
          <span className={cn(T.labelSm, 'text-[#75777d]')}>via {row.routings[0].hub}</span>
        ) : null}
      </div>
      <div className="border-t border-dashed border-[#c5c6cd] pt-4">
        {expandable ? (
          <>
            <button
              type="button"
              onClick={toggle}
              className="group flex w-full items-center justify-between text-left"
            >
              <TransferLine row={row} source={source} />
              <MS
                name={open ? 'expand_less' : 'expand_more'}
                className="text-[20px] text-[#c5c6cd] transition-colors group-hover:text-[#091426]"
              />
            </button>
            {open ? (
              <div className="mt-2 border-l-2 border-[#e0e3e5] pl-2">
                <p className={cn(T.dataLabel, 'mb-1 text-[#45474c]')}>
                  Ratio: <span className="font-semibold text-[#191c1e]">{row.multiplier}×</span>
                </p>
                <p className={cn(T.dataLabel, 'text-[#45474c]')}>
                  Complexity:{' '}
                  <span className="font-semibold text-[#191c1e]">{complexityLabel(row)}</span>
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <TransferLine row={row} source={source} />
        )}
      </div>
    </div>
  )
}

// Desktop card — verbatim structure from desktop2.html.
function DesktopCard({
  row,
  origin,
  destination,
  cabin,
  open,
  toggle,
}: {
  row: AwardPlanRow
  origin: string
  destination: string
  cabin: Cabin
  open: boolean
  toggle: () => void
}) {
  const fig = figure(row, cabin)
  const expandable = row.reachable && row.multiplier !== 1
  const segs = pathSegments(row)
  return (
    <div
      className={cn(
        'flex flex-col rounded-xl bg-white p-6 transition-all',
        open ? 'border-2 border-[#091426] shadow-[0_4px_24px_rgba(9,20,38,0.08)]' : 'border border-[#c5c6cd] hover:shadow-[0_4px_24px_rgba(9,20,38,0.04)]',
        'group',
      )}
    >
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div className="flex flex-1 items-center gap-6">
          <div className="flex flex-col">
            <span className={cn(T.labelSm, 'mb-1 text-[#45474c]')}>Routing</span>
            <div className="flex items-center gap-3">
              <span className={cn(T.dataLabel, 'font-bold text-[#091426]')}>{origin}</span>
              <RouteDots />
              <span className={cn(T.dataLabel, 'font-bold text-[#091426]')}>{destination}</span>
            </div>
          </div>
          <div className="hidden h-10 w-px bg-[#c5c6cd]/30 md:block" />
          <div className="flex flex-col">
            <span className={cn(T.labelSm, 'mb-1 text-[#45474c]')}>Programme</span>
            <span className={cn(T.bodyMd, 'font-medium text-[#191c1e]')}>
              {prettySlug(row.programme)}
              {row.stops === 1 && row.routings[0]?.hub ? (
                <span className="ml-1 text-[#75777d]">· via {row.routings[0].hub}</span>
              ) : null}
            </span>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-between gap-8 md:justify-end">
          <div className="flex min-w-[160px] flex-col items-end">
            <span className={cn(T.labelSm, 'mb-1 text-[#45474c]')}>Cost</span>
            <div className="flex items-baseline gap-2">
              <span className={cn(T.dataDisplay, 'text-[#091426]')}>{fig.big}</span>
              {fig.small ? (
                <span className={cn(T.dataLabel, 'text-[#45474c]')}>{fig.small}</span>
              ) : null}
            </div>
          </div>
          {expandable ? (
            <button
              type="button"
              onClick={toggle}
              className={cn(
                'hidden rounded bg-[#091426] px-4 py-2 text-white transition-colors hover:bg-[#0b1426] md:block',
                T.dataLabel,
              )}
            >
              {open ? 'Hide' : 'Path'}
            </button>
          ) : null}
        </div>
      </div>
      {open && expandable ? (
        <div className="mt-6 border-t border-[#c5c6cd]/50 pt-4">
          <div className="flex items-center gap-3 rounded-lg bg-[#f7f9fb] p-3">
            <MS name="account_balance_wallet" className="text-[18px] text-[#45474c]" />
            <span className={cn(T.labelSm, 'text-[#45474c]')}>
              <span className="font-medium text-[#091426]">{segs[0]}</span>
              {segs.length > 1 ? ` → ${segs.slice(1).join(' → ')}` : ''} · {row.multiplier}× ·{' '}
              {complexityLabel(row)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ───────────────────────── Main view ─────────────────────────

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

  // Hydrate from URL once on mount (deep-linkable); kept in an effect so SSR and
  // first client render agree on defaults.
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

  const f: FilterState = {
    airlines,
    excluded,
    toggleAirline,
    stops,
    setStops,
    source,
    setSource,
  }

  const unresolvedSource = source && data && !data.source_currency

  // A small editable IATA field styled to the mock typography.
  const iataInput = (
    value: string,
    set: (v: string) => void,
    placeholder: string,
    align: 'left' | 'right',
  ) => (
    <input
      value={value}
      onChange={(e) => set(e.target.value.toUpperCase().slice(0, 3))}
      placeholder={placeholder}
      className={cn(
        'w-16 bg-transparent uppercase tracking-wide text-[#191c1e] outline-none placeholder:text-[#c5c6cd]',
        T.bodyMd,
        'font-semibold',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    />
  )

  const emptyOrStatus = (
    <>
      {!ready ? (
        <p className={cn(T.bodyMd, 'py-16 text-center text-[#75777d]')}>
          Enter an origin and destination to explore award options.
        </p>
      ) : loading ? (
        <div className={cn('flex items-center gap-2 py-10 text-[#75777d]', T.bodyMd)}>
          <MS name="progress_activity" className="animate-spin text-[18px]" />
          Pricing every routing and programme…
        </div>
      ) : error ? (
        <p className={cn(T.bodyMd, 'py-6 text-[#ba1a1a]')}>Couldn’t load options: {error}</p>
      ) : !data || rows.length === 0 ? (
        <p className={cn(T.bodyMd, 'py-6 text-[#45474c]')}>
          No award options found for {origin} → {destination}.
        </p>
      ) : null}
    </>
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f9fb] font-sans text-[#191c1e]">
      {/* ════════════════ MOBILE ════════════════ */}
      <div className="flex h-full min-h-0 flex-col md:hidden">
        <div className="sticky top-0 z-40 border-b border-[#c5c6cd] bg-[#f7f9fb] shadow-sm">
          <header className="flex w-full items-center gap-2 px-4 py-4 text-[#091426]">
            <MS name="flight_takeoff" />
            <span className={cn(T.headlineMd, 'font-bold text-[#091426]')}>Award Explorer</span>
          </header>
          <div className="flex items-center justify-between px-4 pb-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-[#c5c6cd] bg-white px-3 py-2 shadow-sm">
              <div className="flex flex-1 flex-col">
                <span className={cn(T.labelSm, 'text-[#45474c]')}>From</span>
                {iataInput(origin, setOrigin, 'BLR', 'left')}
              </div>
              <MS name="arrow_right_alt" className="text-[#75777d]" />
              <div className="flex flex-1 flex-col items-end">
                <span className={cn(T.labelSm, 'text-[#45474c]')}>To</span>
                {iataInput(destination, setDestination, 'NRT', 'right')}
              </div>
            </div>
          </div>
          <div className="px-4 pb-4">
            <CabinPills cabin={cabin} setCabin={setCabin} />
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-[#c5c6cd] bg-[#f2f4f6] px-4 py-2">
            {['Transfer from', 'Airlines', 'Stops'].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setFiltersOpen(true)}
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded border border-[#c5c6cd] bg-white px-3 py-1.5 text-[#191c1e]',
                  T.labelSm,
                )}
              >
                {label} <MS name="arrow_drop_down" className="text-[16px]" />
              </button>
            ))}
          </div>
        </div>
        <main className="flex flex-col gap-4 overflow-y-auto px-4 py-4 pb-12">
          {emptyOrStatus}
          {unresolvedSource ? (
            <p className={cn(T.labelSm, 'rounded bg-amber-50 px-3 py-2 text-amber-700')}>
              Couldn’t match “{source}” to a card — showing miles only.
            </p>
          ) : null}
          {data &&
            rows.map((row, i) => {
              const k = rowKey(row, i)
              return (
                <MobileCard
                  key={k}
                  row={row}
                  origin={data.origin}
                  destination={data.destination}
                  cabin={cabin}
                  source={source}
                  open={expanded.has(k)}
                  toggle={() => toggleExpanded(k)}
                />
              )
            })}
        </main>
      </div>

      {/* ════════════════ DESKTOP ════════════════ */}
      <div className="hidden h-full min-h-0 flex-col md:flex">
        <header className="sticky top-0 z-40 border-b border-[#c5c6cd] bg-[#f7f9fb]">
          <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-12 py-4">
            <div className="flex items-center gap-2">
              <MS name="flight_takeoff" className="text-[#091426]" />
              <span className={cn(T.headlineMd, 'font-bold text-[#091426]')}>Award Explorer</span>
            </div>
            <div className="flex items-center gap-6 rounded-full border border-[#c5c6cd] bg-[#f2f4f6] px-6 py-2">
              <div className="flex items-center gap-2">
                {iataInput(origin, setOrigin, 'BLR', 'left')}
                <MS name="arrow_forward" className="text-[16px] text-[#75777d]" />
                {iataInput(destination, setDestination, 'NRT', 'left')}
              </div>
              <div className="h-4 w-px bg-[#c5c6cd]" />
              <CabinPills cabin={cabin} setCabin={setCabin} />
            </div>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-[1200px] min-h-0 flex-1 gap-6 overflow-hidden px-12 py-8">
          <aside className="sticky top-32 flex w-64 shrink-0 flex-col gap-8 self-start rounded-xl border border-[#c5c6cd] bg-[#f2f4f6] p-6">
            <h2 className={cn(T.headlineMd, 'font-bold text-[#091426]')}>Filters</h2>
            <FilterBody f={f} />
          </aside>
          <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h1 className={cn(T.headlineLg, 'mb-2 text-[#091426]')}>Award Flights</h1>
                <p className={cn(T.bodyMd, 'text-[#45474c]')}>
                  {ready ? `Showing availability for ${origin} to ${destination}` : 'Enter a route'}
                </p>
              </div>
              <div className="flex items-center gap-4 text-[#45474c]">
                <span className={cn(T.dataLabel)}>Sort by:</span>
                <span className={cn(T.labelSm, 'text-[#091426]')}>Lowest Points</span>
              </div>
            </div>
            {emptyOrStatus}
            {unresolvedSource ? (
              <p className={cn(T.labelSm, 'mb-4 rounded bg-amber-50 px-3 py-2 text-amber-700')}>
                Couldn’t match “{source}” to a card — showing miles only.
              </p>
            ) : null}
            <div className="flex flex-col gap-4">
              {data &&
                rows.map((row, i) => {
                  const k = rowKey(row, i)
                  return (
                    <DesktopCard
                      key={k}
                      row={row}
                      origin={data.origin}
                      destination={data.destination}
                      cabin={cabin}
                      open={expanded.has(k)}
                      toggle={() => toggleExpanded(k)}
                    />
                  )
                })}
            </div>
          </main>
        </div>
      </div>

      {/* Mobile filters dialog */}
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-6">
            <FilterBody f={f} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
