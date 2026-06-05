'use client'

import { Fragment, useState } from 'react'
import { ArrowRight, Check, ChevronDown, ChevronsUpDown, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
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
import type { ExploreAirline } from '@/durable/agents/tools/concierge/award-explore'
import type { TransferSource } from '@/durable/agents/tools/concierge/transfer-sources'

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

// This theme's --muted and --background are near-identical, so the default
// (white-on-muted) active tab is invisible. Use the dark `primary` fill instead,
// keyed on aria-selected (a built-in Tailwind variant; base-ui sets it on the
// active tab).
const ACTIVE_TAB =
  'aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:shadow-sm'

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

export const rowKey = (r: AwardPlanRow, i: number) => `${r.programme}|${r.stops}|${i}`

function routingText(row: AwardPlanRow): string {
  const r = row.routings[0]
  if (!r) return ''
  return row.stops === 0 ? 'Direct' : `1-stop · ${r.hub ?? '?'}`
}

function Figure({ row, cabin }: { row: AwardPlanRow; cabin: Cabin }) {
  const cost = row.cost[cabin]
  const miles = row.miles[cabin]
  if (cost === 'dynamic' || miles === 'dynamic')
    return <span className="font-mono text-sm text-amber-600">varies</span>
  if (Array.isArray(cost)) {
    const pts = cost[0] === cost[1] ? fmt(cost[0]) : `${fmt(cost[0])}–${fmt(cost[1])}`
    return (
      <span className="whitespace-nowrap font-mono tabular-nums">
        <span className="text-sm font-medium text-foreground">{pts}</span>
        {Array.isArray(miles) ? (
          <span className="ml-1.5 text-[11px] text-muted-foreground">{fmtK(miles[0])}</span>
        ) : null}
      </span>
    )
  }
  if (Array.isArray(miles))
    return (
      <span className="font-mono text-sm tabular-nums text-muted-foreground">{fmtK(miles[0])}</span>
    )
  return <span className="text-muted-foreground">—</span>
}

// Direct = green, one-stop = blue (used for the row's color coding).
const STOP_DOT = (stops: number) =>
  stops === 0 ? 'bg-emerald-500' : 'bg-blue-500'
const STOP_TEXT = (stops: number) =>
  stops === 0 ? 'text-emerald-700' : 'text-blue-700'

function TransferPath({
  row,
  source,
  names,
}: {
  row: AwardPlanRow
  source: string
  names: Names
}) {
  if (row.multiplier === 1)
    return <span>{nameOf(row.programme, names)} — you already hold these</span>
  if (!row.reachable)
    return (
      <span className="italic">
        {source ? 'not reachable from this card' : 'pick a card to cost this in points'}
      </span>
    )
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
              <TabsTrigger key={s.key} value={s.key} className={ACTIVE_TAB}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </FilterBlock>

      <FilterBlock title="Airlines">
        <Tabs value={f.airlineMode} onValueChange={(v) => f.onAirlineMode(v as AirlineMode)}>
          <TabsList className="w-full">
            <TabsTrigger value="include" className={ACTIVE_TAB}>
              Include
            </TabsTrigger>
            <TabsTrigger value="exclude" className={ACTIVE_TAB}>
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

function Results({
  status,
  error,
  rows,
  cabin,
  source,
  names,
  origin,
  destination,
  expanded,
  onToggleExpanded,
}: {
  status: ExploreStatus
  error?: string
  rows: AwardPlanRow[]
  cabin: Cabin
  source: string
  names: Names
  origin: string
  destination: string
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

  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableBody>
          {rows.map((row, i) => {
            const k = rowKey(row, i)
            const open = expanded.has(k)
            return (
              <Fragment key={k}>
                <TableRow className="cursor-pointer" onClick={() => onToggleExpanded(k)}>
                  <TableCell className="w-0 pr-0">
                    <span
                      className={cn('block size-1.5 rounded-full', STOP_DOT(row.stops))}
                      aria-hidden
                    />
                  </TableCell>
                  <TableCell className="w-full max-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-foreground">
                        {nameOf(row.programme, names)}
                      </span>
                      {row.own_metal ? (
                        <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px]">
                          metal
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className={cn('text-right text-xs', STOP_TEXT(row.stops))}>
                    {routingText(row)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Figure row={row} cabin={cabin} />
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
                    <TableCell
                      colSpan={5}
                      className="bg-muted/30 py-2 pl-7 text-xs whitespace-normal text-muted-foreground"
                    >
                      <TransferPath row={row} source={source} names={names} />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </Card>
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
  rows: AwardPlanRow[]
  names: Names
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
      {/* Toolbar — same width/container as the results below */}
      <div className="border-b">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3 px-4 py-2.5">
          <div className="flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1">
            <Input
              value={props.origin}
              onChange={(e) => props.onOrigin(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="BLR"
              className="h-6 w-12 border-0 px-0 text-center font-mono text-sm uppercase shadow-none focus-visible:ring-0"
            />
            <ArrowRight className="size-3.5 text-muted-foreground" />
            <Input
              value={props.destination}
              onChange={(e) => props.onDestination(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="NRT"
              className="h-6 w-12 border-0 px-0 text-center font-mono text-sm uppercase shadow-none focus-visible:ring-0"
            />
          </div>

          <Tabs value={props.cabin} onValueChange={(v) => props.onCabin(v as Cabin)}>
            <TabsList>
              {CABIN_TABS.map((c) => (
                <TabsTrigger key={c.key} value={c.key} className={cn('font-mono', ACTIVE_TAB)}>
                  {c.short}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal className="size-3.5" /> Filters
            {activeFilters > 0 ? (
              <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                {activeFilters}
              </Badge>
            ) : null}
          </Button>
        </div>
      </div>

      {/* Results (same container) */}
      <main className="min-h-0 flex-1 overflow-y-auto">
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
