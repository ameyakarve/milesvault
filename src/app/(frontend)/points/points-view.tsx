'use client'

import { useEffect, useState } from 'react'
import { Points, type PointsStatus } from './points-ui'
import type { PointsPathsResult } from '@/durable/agents/tools/concierge/points-paths'

// Thin container: holds state + fetches the points-paths endpoint, hands the
// graph to the presentational <Points>. Backward dual of ExploreView.
export function PointsView() {
  const [target, setTarget] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [maxHops, setMaxHops] = useState(3)
  const [showCards, setShowCards] = useState(true)
  const [bestOnly, setBestOnly] = useState(true)

  // target + amount are URL-synced so the explorer can deep-link in.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const q = new URLSearchParams(window.location.search)
    const t = q.get('target')
    if (t) setTarget(t)
    const a = q.get('amount')
    if (a && Number.isFinite(Number(a))) setAmount(Number(a))
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    const q = new URLSearchParams()
    if (target) q.set('target', target)
    if (amount != null) q.set('amount', String(amount))
    const qs = q.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [target, amount])

  const ready = target.trim().length >= 2
  const reqKey = `${target.trim()}|${amount ?? ''}`
  const [result, setResult] = useState<{
    key: string
    data?: PointsPathsResult
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
      const q = new URLSearchParams({ target: target.trim() })
      if (amount != null) q.set('amount', String(amount))
      fetch(`/api/concierge/points-paths?${q.toString()}`)
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`)
          return (await r.json()) as PointsPathsResult
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
  const status: PointsStatus = !ready
    ? 'idle'
    : !result || result.key !== reqKey
      ? 'loading'
      : error
        ? 'error'
        : 'ready'

  return (
    <Points
      target={target}
      onTarget={setTarget}
      status={status}
      data={data}
      error={error}
      maxHops={maxHops}
      onMaxHops={setMaxHops}
      showCards={showCards}
      onShowCards={setShowCards}
      bestOnly={bestOnly}
      onBestOnly={setBestOnly}
    />
  )
}
