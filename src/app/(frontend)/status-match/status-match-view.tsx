'use client'

import { useEffect, useState } from 'react'
import { StatusMatch, type SmStatus } from './status-match-ui'
import type { StatusMatchResult, MatchStatus } from '@/durable/agents/tools/concierge/status-match-paths'

export function StatusMatchView() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [statuses, setStatuses] = useState<MatchStatus[]>([])
  const [result, setResult] = useState<{ key: string; data: StatusMatchResult } | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [ready, setReady] = useState(false)

  // Status universe for the from/to comboboxes — loaded once.
  useEffect(() => {
    let cancelled = false
    fetch('/api/concierge/match-statuses')
      .then((r) => (r.ok ? (r.json() as Promise<{ statuses?: MatchStatus[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => !cancelled && setStatuses(d.statuses ?? []))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

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
      status={status}
      data={result?.data}
      error={error}
    />
  )
}
