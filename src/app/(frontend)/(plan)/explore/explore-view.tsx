'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Explore,
  CABIN_TABS,
  type AirlineMode,
  type Cabin,
  type SortKey,
  type Stops,
} from './explore-ui'
import type { AwardExploreResult, ExploreRow } from '@/durable/agents/tools/concierge/award-explore'

const isIata = (s: string) => /^[A-Z]{3}$/.test(s)

// Sort key for a row in the chosen cabin: the programme's own published miles
// (the explorer shows miles, never a costed plan).
function primaryValue(row: ExploreRow, cabin: Cabin): number {
  const m = row.miles[cabin]
  if (Array.isArray(m)) return m[0]
  return Number.POSITIVE_INFINITY
}

// Thin container: holds state + fetches the award-explore endpoint, then hands
// everything to the presentational <Explore>. All names come from the endpoint's
// KG-derived `names` map — nothing is hardcoded here.
export function ExploreView() {
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [cabin, setCabin] = useState<Cabin>('business')
  const [stops, setStops] = useState<Stops>('all')
  const [sort, setSort] = useState<SortKey>('cost')
  const [airlineMode, setAirlineMode] = useState<AirlineMode>('include')
  const [selectedAirlines, setSelectedAirlines] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Origin / destination / cabin are URL-synced (shareable).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const q = new URLSearchParams(window.location.search)
    const o = (q.get('origin') ?? '').toUpperCase()
    const d = (q.get('destination') ?? '').toUpperCase()
    if (o) setOrigin(o)
    if (d) setDestination(d)
    const c = q.get('cabin') as Cabin | null
    if (c && CABIN_TABS.some((t) => t.key === c)) setCabin(c)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    const q = new URLSearchParams()
    if (origin) q.set('origin', origin)
    if (destination) q.set('destination', destination)
    q.set('cabin', cabin)
    const qs = q.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [origin, destination, cabin])

  const ready = isIata(origin) && isIata(destination)
  const reqKey = `${origin}|${destination}`
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

  const data = result?.key === reqKey ? result.data : undefined
  const error = result?.key === reqKey ? result.error : undefined
  const status = !ready
    ? 'idle'
    : !result || result.key !== reqKey
      ? 'loading'
      : error
        ? 'error'
        : 'ready'

  const onToggleAirline = useCallback((iata: string) => {
    setSelectedAirlines((prev) => {
      const next = new Set(prev)
      if (next.has(iata)) next.delete(iata)
      else next.add(iata)
      return next
    })
  }, [])
  const onToggleExpanded = useCallback((k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }, [])
  const onReset = useCallback(() => {
    setStops('all')
    setSelectedAirlines(new Set())
    setAirlineMode('include')
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    let r = data.rows.filter((x) => x.miles[cabin] != null)
    if (stops !== 'all') r = r.filter((x) => String(x.stops) === stops)
    // Airline include/exclude (over the routing's carriers).
    if (selectedAirlines.size) {
      r = r.filter((x) => {
        const carriers = x.routings[0]?.carriers ?? []
        const hit = carriers.some((c) => selectedAirlines.has(c))
        return airlineMode === 'include' ? hit : !hit
      })
    }
    const byCost = (a: ExploreRow, b: ExploreRow) => primaryValue(a, cabin) - primaryValue(b, cabin)
    return [...r].sort((a, b) => {
      if (sort === 'stops') return a.stops - b.stops || byCost(a, b)
      if (sort === 'distance') return a.total_distance - b.total_distance || byCost(a, b)
      return byCost(a, b)
    })
  }, [data, cabin, stops, selectedAirlines, airlineMode, sort])

  return (
    <Explore
      origin={origin}
      destination={destination}
      onOrigin={setOrigin}
      onDestination={setDestination}
      cabin={cabin}
      onCabin={setCabin}
      airlines={data?.airlines ?? []}
      airlineMode={airlineMode}
      onAirlineMode={setAirlineMode}
      selectedAirlines={selectedAirlines}
      onToggleAirline={onToggleAirline}
      stops={stops}
      onStops={setStops}
      sort={sort}
      onSort={setSort}
      status={status}
      error={error}
      rows={rows}
      names={data?.names ?? {}}
      airports={data?.airports ?? {}}
      resultOrigin={data?.origin ?? origin}
      resultDestination={data?.destination ?? destination}
      onReset={onReset}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
    />
  )
}
