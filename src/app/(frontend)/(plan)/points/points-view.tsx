'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAsyncData } from '@/components/shared/use-async-data'
import { fetchJSON } from '@/lib/fetch-json'
import { Points, type PointsStatus, type PointsFilters } from './points-ui'
import type { PointsPathsResult } from '@/durable/agents/tools/concierge/points-paths'
import type { LoyaltyCurrency } from '@/durable/agents/tools/concierge/loyalty-currencies'

// Thin container: holds state + fetches the points-paths endpoint, hands the
// graph to the presentational <Points>. Backward dual of ExploreView.
export function PointsView() {
  const [target, setTarget] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  // 'to' = booking (pick a destination, see all sources). 'from' = book-from
  // (pick a programme/card you hold, see everywhere it can book).
  const [direction, setDirection] = useState<'to' | 'from'>('to')

  // The searchable target universe — fetched once. A failure leaves the picker
  // empty rather than swallowing the error silently.
  const currencies =
    useAsyncData<LoyaltyCurrency[]>(
      (signal) =>
        fetchJSON<{ currencies?: LoyaltyCurrency[] }>('/api/concierge/currencies', {
          signal,
        }).then((d) => d.currencies ?? []),
      [],
    ).data ?? []

  // filters
  const [mineOnly, setMineOnly] = useState(true)
  const [maxHops, setMaxHops] = useState(3)
  // The single visibility model — node ids hidden from the graph, driven by both
  // the per-node hide button and the Filters chips.
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  // target + amount are URL-synced so the explorer can deep-link in.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const q = new URLSearchParams(window.location.search)
    const t = q.get('target')
    if (t) setTarget(t)
    const a = q.get('amount')
    if (a && Number.isFinite(Number(a))) setAmount(Number(a))
    if (q.get('dir') === 'from') setDirection('from')
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    const q = new URLSearchParams()
    if (target) q.set('target', target)
    if (amount != null) q.set('amount', String(amount))
    if (direction === 'from') q.set('dir', 'from')
    const qs = q.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [target, amount, direction])

  const ready = target.trim().length >= 2
  const reqKey = `${target.trim()}|${amount ?? ''}|${direction}`
  const [result, setResult] = useState<{ key: string; data?: PointsPathsResult; error?: string } | null>(null)

  useEffect(() => {
    if (!ready) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResult(null)
      return
    }
    let cancelled = false
    const handle = setTimeout(() => {
      const q = new URLSearchParams({ target: target.trim() })
      if (amount != null) q.set('amount', String(amount))
      if (direction === 'from') q.set('direction', 'from')
      fetch(`/api/concierge/points-paths?${q.toString()}`)
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`)
          return (await r.json()) as PointsPathsResult
        })
        .then((d) => !cancelled && setResult({ key: reqKey, data: d }))
        .catch((e) => !cancelled && setResult({ key: reqKey, error: e instanceof Error ? e.message : String(e) }))
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey, ready])

  const data = result?.key === reqKey ? result.data : undefined
  const error = result?.key === reqKey ? result.error : undefined
  const status: PointsStatus = !ready ? 'idle' : !result || result.key !== reqKey ? 'loading' : error ? 'error' : 'ready'

  // Toggle one node's visibility.
  const onToggleHidden = useCallback(
    (slug: string) =>
      setHidden((prev) => {
        const next = new Set(prev)
        if (next.has(slug)) next.delete(slug)
        else next.add(slug)
        return next
      }),
    [],
  )
  // Toggle a whole bank's cards: if all are already hidden, show them; else hide
  // them all.
  const onToggleHiddenMany = useCallback((slugs: string[]) => {
    setHidden((prev) => {
      const next = new Set(prev)
      const allHidden = slugs.every((s) => next.has(s))
      for (const s of slugs) {
        if (allHidden) next.delete(s)
        else next.add(s)
      }
      return next
    })
  }, [])
  const onUnhideAll = useCallback(() => setHidden(new Set()), [])

  // changing the target clears the per-result visibility (the options differ)
  const onTarget = useCallback((slug: string) => {
    setTarget(slug)
    setHidden(new Set())
  }, [])

  // flipping booking ↔ book-from changes the whole input universe (a card is a
  // valid anchor only in book-from), so reset the picked anchor and visibility.
  const onDirection = useCallback((d: 'to' | 'from') => {
    setDirection(d)
    setTarget('')
    setHidden(new Set())
  }, [])

  const filters: PointsFilters = { mineOnly, maxHops, hidden }

  return (
    <Points
      target={target}
      onTarget={onTarget}
      direction={direction}
      onDirection={onDirection}
      currencies={currencies}
      status={status}
      data={data}
      error={error}
      filters={filters}
      onMineOnly={setMineOnly}
      onMaxHops={setMaxHops}
      onToggleHidden={onToggleHidden}
      onToggleHiddenMany={onToggleHiddenMany}
      onUnhideAll={onUnhideAll}
    />
  )
}
