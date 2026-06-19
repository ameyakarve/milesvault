'use client'

import { useEffect, useRef, useState } from 'react'
import { useAsyncData } from '@/components/shared/use-async-data'
import { fetchJSON } from '@/lib/fetch-json'
import { StatusMatch, type SmStatus } from './status-match-ui'
import type { StatusMatchResult, MatchStatus } from '@/durable/agents/tools/concierge/status-match-paths'

const NO_STATUSES: MatchStatus[] = []
const NO_HELD: string[] = []

export function StatusMatchView() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [result, setResult] = useState<{ key: string; data: StatusMatchResult } | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [ready, setReady] = useState(false)

  // Status universe for the from/to comboboxes (+ the user's held tiers) —
  // loaded once. Stable empty fallbacks keep the seed effect's deps stable.
  const universe = useAsyncData<{ statuses: MatchStatus[]; held: string[] }>(
    (signal) =>
      fetchJSON<{ statuses?: MatchStatus[]; held?: string[] }>('/api/concierge/match-statuses', {
        signal,
      }).then((d) => ({ statuses: d.statuses ?? [], held: d.held ?? [] })),
    [],
  )
  const statuses = universe.data?.statuses ?? NO_STATUSES
  const held = universe.data?.held ?? NO_HELD

  // Seed From with the user's first held tier — once, and only when neither
  // the URL nor the user has picked one. The blank picker stays available.
  const seededRef = useRef(false)
  useEffect(() => {
    if (!ready || seededRef.current || held.length === 0) return
    seededRef.current = true
    if (!from) setFrom(held[0])
  }, [ready, held, from])

  // URL: read once on mount, then keep ?from=&to= in sync.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('from')) setFrom(p.get('from')!)
    if (p.get('to')) setTo(p.get('to')!)
    setReady(true)
  }, [])
  useEffect(() => {
    if (!ready) return
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    const qs = p.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [from, to, ready])

  const reqKey = `${from}|${to}`
  useEffect(() => {
    if (!ready) return
    if (!from) {
      setResult(undefined)
      return
    }
    let cancelled = false
    setError(undefined)
    const handle = setTimeout(() => {
      const q = new URLSearchParams({ from })
      if (to) q.set('to', to)
      fetch(`/api/concierge/status-match-paths?${q.toString()}`)
        .then((r) => (r.ok ? (r.json() as Promise<StatusMatchResult>) : Promise.reject(new Error(String(r.status)))))
        .then((d) => !cancelled && setResult({ key: reqKey, data: d }))
        .catch((e) => !cancelled && setError(String(e)))
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [from, to, ready, reqKey])

  const status: SmStatus =
    !ready ? 'idle'
    : !from ? 'idle'
    : error ? 'error'
    : !result || result.key !== reqKey ? 'loading'
    : 'ready'

  return (
    <StatusMatch
      from={from}
      to={to}
      onFrom={setFrom}
      onTo={setTo}
      statuses={statuses}
      held={held}
      status={status}
      data={result?.data}
      error={error}
    />
  )
}
