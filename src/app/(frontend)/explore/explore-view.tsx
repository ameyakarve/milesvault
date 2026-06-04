'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Explore, CABIN_TABS, type Cabin, type Stops } from './explore-ui'
import type { AwardExploreResult } from '@/durable/agents/tools/concierge/award-explore'
import type { AwardPlanRow } from '@/durable/agents/tools/concierge/award-plan'
import type { TransferSource } from '@/durable/agents/tools/concierge/transfer-sources'

const isIata = (s: string) => /^[A-Z]{3}$/.test(s)

function primaryValue(row: AwardPlanRow, cabin: Cabin): number {
  const c = row.cost[cabin]
  if (Array.isArray(c)) return c[0]
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
  const [source, setSource] = useState('') // '' = miles only; else a currency/* slug
  const [cabin, setCabin] = useState<Cabin>('business')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [stops, setStops] = useState<Stops>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sources, setSources] = useState<TransferSource[]>([])

  // The KG-derived "Transfer from" list — fetched once, cached server-side.
  useEffect(() => {
    let cancelled = false
    fetch('/api/concierge/transfer-sources')
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ sources?: TransferSource[] }>)
          : ({ sources: [] as TransferSource[] }),
      )
      .then((d) => !cancelled && setSources(d.sources ?? []))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

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
    setExcluded((prev) => {
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

  const rows = useMemo(() => {
    if (!data) return []
    let r = data.rows.filter((x) => x.miles[cabin] != null)
    if (stops !== 'all') r = r.filter((x) => String(x.stops) === stops)
    if (excluded.size)
      r = r.filter((x) => !(x.routings[0]?.carriers ?? []).some((c) => excluded.has(c)))
    return [...r].sort((a, b) => primaryValue(a, cabin) - primaryValue(b, cabin))
  }, [data, cabin, stops, excluded])

  return (
    <Explore
      origin={origin}
      destination={destination}
      onOrigin={setOrigin}
      onDestination={setDestination}
      cabin={cabin}
      onCabin={setCabin}
      source={source}
      onSource={setSource}
      sources={sources}
      airlines={data?.airlines ?? []}
      excluded={excluded}
      onToggleAirline={onToggleAirline}
      stops={stops}
      onStops={setStops}
      status={status}
      error={error}
      rows={rows}
      names={data?.names ?? {}}
      resultOrigin={data?.origin ?? origin}
      resultDestination={data?.destination ?? destination}
      unresolvedSource={Boolean(source && data && !data.source_currency)}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
    />
  )
}
