'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ShowAwardOptionsInput } from '@/durable/agent-ui-schemas'
import type { AwardPlanResult, AwardPlanRow } from '@/durable/agents/tools/concierge/award-plan'

type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
type CabinCell = [number, number] | 'dynamic' | null

const CABIN_COLS: { key: Cabin; label: string }[] = [
  { key: 'economy', label: 'Economy' },
  { key: 'premium_economy', label: 'Premium' },
  { key: 'business', label: 'Business' },
  { key: 'first', label: 'First' },
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

// One routing → "Direct — JL" / "1-stop via HKG (CX·JL)". Carriers bold when
// the option flies the programme's own metal (usually cheaper, surcharge-light).
function routingLabel(row: AwardPlanRow): { hub: string; carriers: string; extra: string } {
  const first = row.routings[0]
  const carriers = first ? first.carriers.join('·') : ''
  const hub = row.stops === 0 ? 'Direct' : `1-stop via ${first?.hub ?? '?'}`
  const extra = row.routings.length > 1 ? `+${row.routings.length - 1}` : ''
  return { hub, carriers, extra }
}

// A cabin cell: cost in the card's points (primary) with raw miles (secondary).
// When unreachable we still show the miles so the option is legible.
function CabinValue({ cost, miles }: { cost: CabinCell; miles: CabinCell }) {
  if (cost === 'dynamic' || miles === 'dynamic')
    return <span className="text-amber-600">varies</span>
  if (Array.isArray(cost)) {
    const pts = cost[0] === cost[1] ? fmt(cost[0]) : `${fmt(cost[0])}–${fmt(cost[1])}`
    return (
      <span className="tabular-nums">
        {pts}
        {Array.isArray(miles) ? (
          <span className="block text-[10px] text-muted-foreground">{fmtK(miles[0])} mi</span>
        ) : null}
      </span>
    )
  }
  if (Array.isArray(miles))
    return <span className="tabular-nums text-muted-foreground">{fmtK(miles[0])} mi</span>
  return <span className="text-muted-foreground">—</span>
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs transition-colors',
        on
          ? 'border-foreground bg-foreground text-background'
          : 'border-input bg-background text-muted-foreground hover:bg-accent',
      )}
    >
      {children}
    </button>
  )
}

export function AwardOptionsCard({ input }: { input: ShowAwardOptionsInput }) {
  // One keyed result for the in-flight request. Keying by the request lets us
  // DERIVE loading/error/data in render (no synchronous setState in the effect,
  // which would cause cascading re-renders): we're "loading" until a result
  // tagged with the current key arrives.
  const reqKey = `${input.origin}|${input.destination}|${input.source}`
  const [result, setResult] = useState<{
    key: string
    data?: AwardPlanResult
    error?: string
  } | null>(null)

  // Filters — all client-side over the full set the endpoint returned.
  const [reachableOnly, setReachableOnly] = useState(true)
  const [directOnly, setDirectOnly] = useState(false) // transfer hops ≤ 1
  const [ownMetalOnly, setOwnMetalOnly] = useState(false)
  const [stopsFilter, setStopsFilter] = useState<'all' | '0' | '1'>('all')
  const [sortKey, setSortKey] = useState<Cabin>('business')
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const qs = new URLSearchParams({
      origin: input.origin,
      destination: input.destination,
      source: input.source,
    })
    fetch(`/api/concierge/award-options?${qs.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`)
        return (await r.json()) as AwardPlanResult
      })
      .then((d) => {
        if (!cancelled) setResult({ key: reqKey, data: d })
      })
      .catch((e) => {
        if (!cancelled)
          setResult({ key: reqKey, error: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [reqKey, input.origin, input.destination, input.source])

  const ready = result?.key === reqKey
  const loading = !ready
  const error = ready ? (result?.error ?? null) : null
  const data = ready ? (result?.data ?? null) : null

  const rows = useMemo(() => {
    if (!data) return []
    let r = data.rows
    if (reachableOnly) r = r.filter((x) => x.reachable)
    if (directOnly) r = r.filter((x) => (x.hops ?? 99) <= 1)
    if (ownMetalOnly) r = r.filter((x) => x.own_metal)
    if (stopsFilter !== 'all') r = r.filter((x) => String(x.stops) === stopsFilter)
    const val = (c: CabinCell) => (Array.isArray(c) ? c[0] : Number.POSITIVE_INFINITY)
    return [...r].sort((a, b) => val(a.cost[sortKey]) - val(b.cost[sortKey]))
  }, [data, reachableOnly, directOnly, ownMetalOnly, stopsFilter, sortKey])

  const resolvedSource = data?.source_currency ? prettySlug(data.source_currency) : input.source

  return (
    <Card size="sm" className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-baseline gap-2 text-sm font-normal">
          <span className="font-semibold">
            {input.origin} → {input.destination}
          </span>
          <span className="text-muted-foreground">via {resolvedSource}</span>
        </CardTitle>
      </CardHeader>

      {loading ? (
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Pricing every routing and programme…
        </CardContent>
      ) : error ? (
        <CardContent className="py-4 text-sm text-red-600">
          Couldn’t load award options: {error}
        </CardContent>
      ) : !data || data.rows.length === 0 ? (
        <CardContent className="py-4 text-sm text-muted-foreground">
          No direct or one-stop award options found for this city pair.
        </CardContent>
      ) : (
        <>
          {/* Filters */}
          <CardContent className="flex flex-wrap items-center gap-1.5 pb-2">
            <Toggle on={reachableOnly} onClick={() => setReachableOnly((v) => !v)}>
              Reachable only
            </Toggle>
            <Toggle on={directOnly} onClick={() => setDirectOnly((v) => !v)}>
              Direct transfer
            </Toggle>
            <Toggle on={ownMetalOnly} onClick={() => setOwnMetalOnly((v) => !v)}>
              Own metal
            </Toggle>
            <span className="mx-1 h-4 w-px bg-border" />
            {(['all', '0', '1'] as const).map((s) => (
              <Toggle key={s} on={stopsFilter === s} onClick={() => setStopsFilter(s)}>
                {s === 'all' ? 'All stops' : s === '0' ? 'Nonstop' : '1-stop'}
              </Toggle>
            ))}
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              sort
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as Cabin)}
                className="rounded border border-input bg-background px-1.5 py-1 text-xs"
              >
                {CABIN_COLS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </span>
          </CardContent>

          {/* Table */}
          <div className="overflow-x-auto border-t">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  <th className="px-3 py-1.5 font-medium">Routing</th>
                  <th className="px-3 py-1.5 font-medium">Programme</th>
                  {CABIN_COLS.map((c) => (
                    <th key={c.key} className="px-3 py-1.5 text-right font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const rl = routingLabel(row)
                  const open = expanded === i
                  return (
                    <tr
                      key={`${row.programme}-${row.stops}-${i}`}
                      onClick={() => setExpanded(open ? null : i)}
                      className={cn(
                        'cursor-pointer border-b align-top transition-colors hover:bg-accent/50',
                        !row.reachable && 'opacity-60',
                      )}
                    >
                      <td className="px-3 py-1.5">
                        <div>{rl.hub}</div>
                        <div
                          className={cn(
                            'text-[11px] text-muted-foreground',
                            row.own_metal && 'font-semibold text-foreground',
                          )}
                        >
                          {rl.carriers}
                          {rl.extra ? (
                            <span className="text-muted-foreground"> {rl.extra}</span>
                          ) : null}
                        </div>
                        {open ? (
                          <div className="mt-1 max-w-[260px] text-[11px] text-muted-foreground">
                            {row.reachable ? (
                              <>
                                {row.path.map(prettySlug).join(' → ')}
                                <span className="text-foreground">
                                  {' '}
                                  · {row.multiplier}× · {row.hops} hop
                                  {row.hops === 1 ? '' : 's'}
                                </span>
                              </>
                            ) : (
                              <span className="italic">not reachable from {resolvedSource}</span>
                            )}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-1.5">{prettySlug(row.programme)}</td>
                      {CABIN_COLS.map((c) => (
                        <td key={c.key} className="px-3 py-1.5 text-right">
                          <CabinValue cost={row.cost[c.key]} miles={row.miles[c.key]} />
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2 + CABIN_COLS.length}
                      className="px-3 py-4 text-center text-muted-foreground"
                    >
                      No options match these filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <CardContent className="border-t py-2 text-[11px] text-muted-foreground">
            {rows.length} of {data.rows.length} options · costs in {resolvedSource} points · tap a
            row for the transfer path. Miles are the programme’s own award chart.
            {data.source_currency ? null : (
              <span className="text-amber-600">
                {' '}
                Couldn’t resolve “{input.source}” to a currency — showing miles only.
              </span>
            )}
          </CardContent>
        </>
      )}
    </Card>
  )
}
