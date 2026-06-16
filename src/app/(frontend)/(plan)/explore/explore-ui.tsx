'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowRight, Check, ChevronDown, ChevronsUpDown, Coins, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { AwardPlanRow } from '@/durable/agents/tools/concierge/award-plan'
import type { ExploreAirline, ExploreRow, Afford } from '@/durable/agents/tools/concierge/award-explore'
import type { TransferSource } from '@/durable/agents/tools/concierge/transfer-sources'
import type { MapPoint } from './flight-map'
import { PlanToolbar, TAB_ACTIVE } from '../plan-toolbar'

// Heavy (Observable Plot + world outline) — load it only when a row is expanded.
const FlightMap = dynamic(() => import('./flight-map').then((m) => m.FlightMap), { ssr: false })

type Airports = Record<string, [number, number]>

// Build the origin → hub(s) → destination points (with coords) for a row's map.
function routePoints(
  row: AwardPlanRow,
  origin: string,
  destination: string,
  airports: Airports,
): MapPoint[] {
  const seq =
    row.stops === 0 ? [origin, destination] : [origin, row.routings[0]?.hub ?? '', destination]
  const pts: MapPoint[] = []
  for (const iata of seq) {
    const c = iata ? airports[iata] : undefined
    if (c) pts.push({ iata, lat: c[0], lng: c[1] })
  }
  return pts
}

export type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
export type Stops = 'all' | '0' | '1'
export type SortKey = 'cost' | 'stops' | 'distance'
export type AirlineMode = 'include' | 'exclude'

export const CABIN_TABS: { key: Cabin; label: string; short: string }[] = [
  { key: 'economy', label: 'Economy', short: 'ECO' },
  { key: 'premium_economy', label: 'Premium', short: 'PRE' },
  { key: 'business', label: 'Business', short: 'BUS' },
  { key: 'first', label: 'First', short: 'FST' },
]

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'cost', label: 'Cheapest' },
  { key: 'stops', label: 'Fewest stops' },
  { key: 'distance', label: 'Shortest' },
]

const STOPS_TABS: { key: Stops; label: string }[] = [
  { key: 'all', label: 'Any' },
  { key: '0', label: 'Nonstop' },
  { key: '1', label: '1-stop' },
]

// Active tab: use background/foreground so it works on both light and dark.
const fmt = (n: number) => n.toLocaleString('en-US')
const fmtK = (n: number) =>
  n >= 1000 ? `${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : String(n)

// Last-resort label if the KG has no display_name for a slug. Names should come
// from the graph (the endpoint resolves program/currency display_name); this is
// only a fallback so a missing node never renders blank.
function prettySlug(slug: string): string {
  return slug
    .replace(/^[a-z]+\//, '')
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

// KG-derived display name for a slug, from the `names` map the endpoint built.
type Names = Record<string, string>
function nameOf(slug: string, names: Names): string {
  return names[slug] ?? prettySlug(slug)
}

export const rowKey = (r: ExploreRow, i: number) => `${r.programme}|${r.stops}|${i}`

// Direct = emerald chip, one-stop = sky chip (muted, dark-mode safe).
const STOP_CHIP = (stops: number) =>
  stops === 0
    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
    : 'bg-foreground/5 text-foreground border border-border dark:bg-foreground/10'

// "Via": Direct for nonstop, else the connecting airport IATA.
const viaText = (row: AwardPlanRow) =>
  row.stops === 0 ? 'Direct' : (row.routings[0]?.hub ?? '—')

// The per-cabin price as a colored chip (green=direct, blue=one-stop).
function CostChip({ row, cabin }: { row: AwardPlanRow; cabin: Cabin }) {
  const cost = row.cost[cabin]
  const miles = row.miles[cabin]
  let body: React.ReactNode
  if (cost === 'dynamic' || miles === 'dynamic') body = 'varies'
  else if (Array.isArray(cost)) {
    const pts = cost[0] === cost[1] ? fmt(cost[0]) : `${fmt(cost[0])}–${fmt(cost[1])}`
    body = (
      <>
        {pts}
        {Array.isArray(miles) ? (
          <span className="ml-1 font-normal opacity-60">{fmtK(miles[0])}</span>
        ) : null}
      </>
    )
  } else if (Array.isArray(miles)) body = <span className="opacity-70">{fmtK(miles[0])}</span>
  else return <span className="text-muted-foreground">—</span>
  return (
    <Badge
      className={cn('border-transparent font-mono text-xs font-medium tabular-nums', STOP_CHIP(row.stops))}
    >
      {body}
    </Badge>
  )
}

// Affordability chip shown in the results table (no-source branch only).
// tier 'hold'     → emerald chip: "You have the points"
// tier 'transfer' → sky chip:     "Via <src display name>"
function AffordChip({ afford }: { afford: Afford }) {
  if (afford.tier === 'hold') {
    return (
      <Badge className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60">
        You have the points
      </Badge>
    )
  }
  // Transfer tier: NO chip on the collapsed row — the source programme name
  // (e.g. "EDGE Rewards — Burgundy tier") just eats real estate. The transfer
  // path is shown in the expanded detail (AffordDetail).
  return null
}

// Expanded-row detail card: concise have vs need + transfer path for the
// selected cabin when afford data exists (no-source branch only).
function AffordDetail({ afford, names }: { afford: Afford; names: Names }) {
  const srcName = nameOf(afford.src, names)
  const have = fmt(Math.floor(afford.have))
  const need = fmt(afford.need)
  if (afford.tier === 'hold') {
    return (
      <span>
        You hold <strong>{have}</strong> {srcName} — {need} needed for this cabin.
      </span>
    )
  }
  // Transfer path: [src, …, programme_currency]
  const segs = afford.path.map((s) => nameOf(s, names))
  return (
    <span>
      Transfer {need} from {srcName} (you hold {have}).
      {segs.length > 1 ? (
        <>
          {' '}
          Path:{' '}
          {segs.map((s, i) => (
            <span key={i}>
              {i > 0 ? <span className="mx-1 text-muted-foreground/60">→</span> : null}
              {s}
            </span>
          ))}
        </>
      ) : null}
    </span>
  )
}

// Link into the /points Paths-to-Points page for this programme's currency —
// "how do I accumulate the miles this award costs?". Prefills the amount with
// the per-cabin chart figure (in the programme's own miles) when known.
function pointsHref(target: string, row: AwardPlanRow, cabin: Cabin): string {
  const q = new URLSearchParams({ target })
  const miles = row.miles[cabin]
  if (Array.isArray(miles) && miles[0] > 0) q.set('amount', String(miles[0]))
  return `/points?${q.toString()}`
}

function PointsPathCard({ row, cabin, names }: { row: AwardPlanRow; cabin: Cabin; names: Names }) {
  const target = row.programme_currency
  if (!target) return null
  return (
    <a href={pointsHref(target, row, cabin)} onClick={(e) => e.stopPropagation()} className="group block h-full">
      <Card className="flex h-full flex-row items-center gap-2 p-3 transition-colors group-hover:bg-muted/60">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Coins className="size-3.5" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-foreground">
            How to earn {nameOf(target, names)}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">Paths to these points</div>
        </div>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
      </Card>
    </a>
  )
}

function TransferPath({ row, names }: { row: AwardPlanRow; names: Names }) {
  if (row.multiplier === 1)
    return <span>{nameOf(row.programme, names)} — you already hold these</span>
  if (!row.reachable) return <span className="italic">not reachable from this card</span>
  const segs = row.path.map((s) => nameOf(s, names))
  return (
    <span>
      {segs.map((s, i) => (
        <span key={i}>
          {i > 0 ? <span className="mx-1 text-muted-foreground/60">→</span> : null}
          {s}
        </span>
      ))}
      <span className="ml-1 text-foreground">
        · {row.multiplier}× · {row.hops} hop{row.hops === 1 ? '' : 's'}
      </span>
    </span>
  )
}

// ── Filters (reused in the desktop rail + the mobile dialog) ──

export type ExploreFilterProps = {
  source: string
  onSource: (s: string) => void
  // KG-derived "Transfer from" universe (slug → name); empty while it loads.
  sources: TransferSource[]
  // Carriers on the route (from the KG); the include/exclude target set.
  airlines: ExploreAirline[]
  airlineMode: AirlineMode
  onAirlineMode: (m: AirlineMode) => void
  selectedAirlines: Set<string>
  onToggleAirline: (iata: string) => void
  stops: Stops
  onStops: (s: Stops) => void
}

// Searchable "Transfer from" picker over the (large) KG source list. '' = miles
// only; otherwise a `currency/...` slug.
function SourceCombobox({
  value,
  onChange,
  sources,
}: {
  value: string
  onChange: (slug: string) => void
  sources: TransferSource[]
}) {
  const [open, setOpen] = useState(false)
  const selected = sources.find((s) => s.slug === value)
  const label = value === '' ? 'Miles only' : (selected?.name ?? value.replace(/^[a-z]+\//, ''))
  const cards = sources.filter((s) => s.kind === 'card')
  const currencies = sources.filter((s) => s.kind === 'currency')

  const item = (slug: string, name: string) => (
    <CommandItem
      key={slug}
      value={`${name} ${slug}`}
      onSelect={() => {
        onChange(slug)
        setOpen(false)
      }}
    >
      <Check className={cn('size-4', value === slug ? 'opacity-100' : 'opacity-0')} />
      {name}
    </CommandItem>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="w-full justify-between font-normal" />
        }
      >
        <span className="truncate">{label}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search cards & points…" />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="Miles only"
                onSelect={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                <Check className={cn('size-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                Miles only — no card
              </CommandItem>
            </CommandGroup>
            {cards.length > 0 ? (
              <CommandGroup heading="Credit cards">{cards.map((s) => item(s.slug, s.name))}</CommandGroup>
            ) : null}
            {currencies.length > 0 ? (
              <CommandGroup heading="Points & miles">
                {currencies.map((s) => item(s.slug, s.name))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function FilterBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

function Filters({ f }: { f: ExploreFilterProps }) {
  return (
    <div className="space-y-5">
      <FilterBlock title="Transfer from">
        <SourceCombobox value={f.source} onChange={f.onSource} sources={f.sources} />
      </FilterBlock>

      <FilterBlock title="Stops">
        <Tabs value={f.stops} onValueChange={(v) => f.onStops(v as Stops)}>
          <TabsList className="w-full">
            {STOPS_TABS.map((s) => (
              <TabsTrigger key={s.key} value={s.key} className={TAB_ACTIVE}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </FilterBlock>

      <FilterBlock title="Airlines">
        <Tabs value={f.airlineMode} onValueChange={(v) => f.onAirlineMode(v as AirlineMode)}>
          <TabsList className="w-full">
            <TabsTrigger value="include" className={TAB_ACTIVE}>
              Include
            </TabsTrigger>
            <TabsTrigger value="exclude" className={TAB_ACTIVE}>
              Exclude
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {f.airlines.length === 0 ? (
          <p className="text-xs text-muted-foreground">No carriers for this route.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {f.airlines.map((a) => {
              const on = f.selectedAirlines.has(a.iata)
              return (
                <Button
                  key={a.iata}
                  type="button"
                  size="sm"
                  variant={on ? 'default' : 'outline'}
                  onClick={() => f.onToggleAirline(a.iata)}
                  className={cn('h-7 gap-1 px-2 text-xs', !on && 'text-muted-foreground')}
                >
                  <span className="font-mono">{a.iata}</span>
                  <span className="hidden sm:inline">{a.name}</span>
                </Button>
              )
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          {f.selectedAirlines.size === 0
            ? 'None selected — all airlines shown.'
            : f.airlineMode === 'include'
              ? 'Showing only flights on the selected airlines.'
              : 'Hiding flights on the selected airlines.'}
        </p>
      </FilterBlock>
    </div>
  )
}

// ── Results ──

function AirlineChips({ row }: { row: AwardPlanRow }) {
  const carriers = [...new Set(row.routings[0]?.carriers ?? [])]
  return (
    <div className="flex justify-end gap-1">
      {carriers.map((c) => (
        <Badge
          key={c}
          variant={row.own_metal ? 'secondary' : 'outline'}
          className="h-4 px-1 font-mono text-[10px]"
        >
          {c}
        </Badge>
      ))}
    </div>
  )
}

type RowItem = { row: ExploreRow; key: string }

// Affordability tier rank for sorting: 'hold' = 0, 'transfer' = 1, none = 2.
function affordTier(row: ExploreRow, cabin: Cabin): number {
  const a = row.afford?.[cabin]
  if (!a) return 2
  return a.tier === 'hold' ? 0 : 1
}

// One grouped section (Direct / Connecting), capped at 3 rows with a "show more"
// toggle. The Direct section drops the Via column (it's always "Direct").
// When `source` is empty (no-source branch), items are sorted by affordability
// tier ('hold' first, then 'transfer', then unaffordable) before capping.
function ResultSection({
  title,
  items,
  showVia,
  defaultVisible,
  cabin,
  source,
  names,
  origin,
  destination,
  airports,
  expanded,
  onToggleExpanded,
}: {
  title: string
  items: RowItem[]
  showVia: boolean
  defaultVisible: number
  cabin: Cabin
  source: string
  names: Names
  origin: string
  destination: string
  airports: Airports
  expanded: Set<string>
  onToggleExpanded: (k: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  if (items.length === 0) return null

  // Sort by afford tier within the section (no-source only — preserves relative
  // order within each tier because sort is stable in modern JS).
  const sorted =
    !source && items.some((x) => x.row.afford != null)
      ? [...items].sort((a, b) => affordTier(a.row, cabin) - affordTier(b.row, cabin))
      : items

  const cap = Math.max(1, defaultVisible)
  const visible = showAll ? sorted : sorted.slice(0, cap)
  const cols = showVia ? 5 : 4
  return (
    <section>
      <div className="mb-1.5 flex items-baseline gap-2 px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Programme</TableHead>
              <TableHead className="text-right">Airlines</TableHead>
              {showVia ? <TableHead className="text-right">Via</TableHead> : null}
              <TableHead className="text-right">
                {CABIN_TABS.find((c) => c.key === cabin)?.label}
              </TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(({ row, key }) => {
              const open = expanded.has(key)
              const afford = row.afford?.[cabin] ?? null
              return (
                <Fragment key={key}>
                  <TableRow className="cursor-pointer" onClick={() => onToggleExpanded(key)}>
                    <TableCell className="w-full max-w-0">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="block truncate font-medium text-foreground">
                          {nameOf(row.programme, names)}
                        </span>
                        {!source && afford ? (
                          <AffordChip afford={afford} />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <AirlineChips row={row} />
                    </TableCell>
                    {showVia ? (
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {viaText(row)}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-right">
                      <CostChip row={row} cabin={cabin} />
                    </TableCell>
                    <TableCell className="w-0 pr-2 pl-1">
                      <ChevronDown
                        className={cn(
                          'size-3.5 text-muted-foreground transition-transform',
                          open && 'rotate-180',
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  {open ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={cols} className="bg-muted/30 p-3 whitespace-normal">
                        {(() => {
                          const pts = routePoints(row, origin, destination, airports)
                          return (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                              {pts.length >= 2 ? (
                                <Card className="flex h-full items-center justify-center p-2">
                                  <FlightMap points={pts} />
                                </Card>
                              ) : null}
                              {source ? (
                                <Card className="flex h-full items-center p-3 text-xs text-muted-foreground">
                                  <TransferPath row={row} names={names} />
                                </Card>
                              ) : null}
                              {!source && afford ? (
                                <Card className="flex h-full items-center p-3 text-xs text-muted-foreground">
                                  <AffordDetail afford={afford} names={names} />
                                </Card>
                              ) : null}
                              <PointsPathCard row={row} cabin={cabin} names={names} />
                            </div>
                          )
                        })()}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </Card>
      {items.length > cap ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-1.5 px-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {showAll ? 'Show less' : `Show ${items.length - cap} more`}
        </button>
      ) : null}
    </section>
  )
}

// Row + section-chrome heights (px) used to estimate how many rows fill the
// viewport. Rough on purpose — the goal is "basically fills", not pixel exact.
const ROW_H = 37
const SECTION_CHROME = 92 // section title + table header + show-more

function Results({
  status,
  error,
  rows,
  cabin,
  source,
  names,
  origin,
  destination,
  airports,
  availableHeight,
  expanded,
  onToggleExpanded,
}: {
  status: ExploreStatus
  error?: string
  rows: ExploreRow[]
  cabin: Cabin
  source: string
  names: Names
  origin: string
  destination: string
  airports: Airports
  availableHeight: number
  expanded: Set<string>
  onToggleExpanded: (k: string) => void
}) {
  if (status === 'idle')
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Enter an origin and destination to see award options.
      </p>
    )
  if (status === 'loading')
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Pricing every routing and programme…
      </div>
    )
  if (status === 'error')
    return <p className="py-6 text-sm text-destructive">Couldn’t load options: {error}</p>
  if (rows.length === 0)
    return (
      <p className="py-6 text-sm text-muted-foreground">
        No award options found for {origin} → {destination}.
      </p>
    )

  const items: RowItem[] = rows.map((row, i) => ({ row, key: rowKey(row, i) }))
  const direct = items.filter((x) => x.row.stops === 0)
  const connecting = items.filter((x) => x.row.stops !== 0)

  // How many rows fit the viewport by default → fill it. BOTH sections show the
  // same number of rows (split the budget evenly across the present sections).
  const present = (direct.length > 0 ? 1 : 0) + (connecting.length > 0 ? 1 : 0)
  const overhead = 56 + present * SECTION_CHROME // count/sort row + page padding + sections
  const budget =
    availableHeight > 0 ? Math.max(4, Math.floor((availableHeight - overhead) / ROW_H)) : 8
  const perSection = Math.max(2, Math.floor(budget / Math.max(1, present)))
  const directCap = Math.min(direct.length, perSection)
  const connectingCap = Math.min(connecting.length, perSection)

  const sectionProps = { cabin, source, names, origin, destination, airports, expanded, onToggleExpanded }
  return (
    <div className="space-y-5">
      <ResultSection title="Direct" items={direct} showVia={false} defaultVisible={directCap} {...sectionProps} />
      <ResultSection
        title="Connecting"
        items={connecting}
        showVia
        defaultVisible={connectingCap}
        {...sectionProps}
      />
    </div>
  )
}

// ── Top-level presentational view ──

export type ExploreStatus = 'idle' | 'loading' | 'error' | 'ready'

export type ExploreProps = {
  origin: string
  destination: string
  onOrigin: (s: string) => void
  onDestination: (s: string) => void
  cabin: Cabin
  onCabin: (c: Cabin) => void
  status: ExploreStatus
  error?: string
  rows: ExploreRow[]
  names: Names
  airports: Airports
  resultOrigin: string
  resultDestination: string
  sort: SortKey
  onSort: (s: SortKey) => void
  onReset: () => void
  expanded: Set<string>
  onToggleExpanded: (k: string) => void
} & ExploreFilterProps

export function Explore(props: ExploreProps) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Measure the scroll area so the default rows fill the viewport.
  const mainRef = useRef<HTMLElement>(null)
  const [availH, setAvailH] = useState(0)
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const update = () => setAvailH(el.clientHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const f: ExploreFilterProps = {
    source: props.source,
    onSource: props.onSource,
    sources: props.sources,
    airlines: props.airlines,
    airlineMode: props.airlineMode,
    onAirlineMode: props.onAirlineMode,
    selectedAirlines: props.selectedAirlines,
    onToggleAirline: props.onToggleAirline,
    stops: props.stops,
    onStops: props.onStops,
  }
  const activeFilters =
    (props.source ? 1 : 0) +
    (props.stops !== 'all' ? 1 : 0) +
    (props.selectedAirlines.size > 0 ? 1 : 0)

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <PlanToolbar>
          <div className="flex shrink-0 items-center gap-0.5 rounded-lg border bg-card px-1.5 py-1 sm:gap-1.5 sm:px-2">
            <Input
              value={props.origin}
              onChange={(e) => props.onOrigin(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="BLR"
              className="h-6 w-9 border-0 px-0 text-center font-mono text-sm uppercase shadow-none focus-visible:ring-0 sm:w-12"
            />
            <ArrowRight className="size-3 shrink-0 text-muted-foreground sm:size-3.5" />
            <Input
              value={props.destination}
              onChange={(e) => props.onDestination(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="NRT"
              className="h-6 w-9 border-0 px-0 text-center font-mono text-sm uppercase shadow-none focus-visible:ring-0 sm:w-12"
            />
          </div>

          <Tabs
            value={props.cabin}
            onValueChange={(v) => props.onCabin(v as Cabin)}
            className="shrink-0"
          >
            <TabsList>
              {CABIN_TABS.map((c) => (
                <TabsTrigger
                  key={c.key}
                  value={c.key}
                  className={cn('px-1.5 font-mono text-xs sm:px-2 sm:text-sm', TAB_ACTIVE)}
                >
                  {c.short}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Button
            variant="outline"
            size="sm"
            className="ml-auto shrink-0"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal className="size-3.5" />
            <span className="hidden sm:inline">Filters</span>
            {activeFilters > 0 ? (
              <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-[10px]">
                {activeFilters}
              </Badge>
            ) : null}
          </Button>
      </PlanToolbar>

      {/* Results */}
      <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-4">
          {props.status === 'ready' && props.rows.length > 0 ? (
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {props.rows.length} option{props.rows.length === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-1.5">
                <span>Sort</span>
                <Select value={props.sort} onValueChange={(v) => props.onSort(v as SortKey)}>
                  <SelectTrigger size="sm" className="h-7 gap-1 text-xs">
                    {SORT_OPTIONS.find((o) => o.key === props.sort)?.label ?? 'Cheapest'}
                  </SelectTrigger>
                  <SelectContent align="end">
                    {SORT_OPTIONS.map((o) => (
                      <SelectItem key={o.key} value={o.key}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          <Results
            status={props.status}
            error={props.error}
            rows={props.rows}
            cabin={props.cabin}
            source={props.source}
            names={props.names}
            origin={props.resultOrigin}
            destination={props.resultDestination}
            airports={props.airports}
            availableHeight={availH}
            expanded={props.expanded}
            onToggleExpanded={props.onToggleExpanded}
          />
        </div>
      </main>

      {/* Full-screen filters modal */}
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none border-0 p-0 sm:h-[85vh] sm:max-h-[85vh] sm:w-[calc(100%-2rem)] sm:max-w-2xl sm:rounded-xl sm:border"
        >
          <DialogHeader className="flex flex-row items-center justify-between border-b px-5 py-3.5">
            <DialogTitle className="text-sm">Filters</DialogTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setFiltersOpen(false)}
              aria-label="Close filters"
            >
              <X className="size-4" />
            </Button>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <Filters f={f} />
          </div>
          <DialogFooter className="flex flex-row items-center justify-between border-t px-5 py-3">
            <Button variant="ghost" size="sm" onClick={props.onReset} disabled={activeFilters === 0}>
              Reset
            </Button>
            <Button size="sm" onClick={() => setFiltersOpen(false)}>
              Show {props.rows.length} option{props.rows.length === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
