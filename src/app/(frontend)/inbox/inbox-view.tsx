'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type CaptureRow = {
  id: string
  source: string
  artifact: string | null
  filename: string | null
  state: string
  prompt: string | null
  created_at: number
}

const STATE_STYLE: Record<string, string> = {
  captured: 'bg-amber-50 text-amber-700 border-amber-200',
  extracted: 'bg-sky-50 text-sky-700 border-sky-200',
  posted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  dismissed: 'bg-slate-50 text-slate-500 border-slate-200',
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// The capture lifecycle view (ledger-pipeline.md §2): everything that arrived
// from a source, newest first. Statement uploads land here today; email and
// paste captures join as F2/F3 fill out.
export function InboxView() {
  const [allRows, setAllRows] = useState<CaptureRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/ledger/forwarding-address')
      .then((r) => (r.ok ? (r.json() as Promise<{ address?: string }>) : null))
      .then((d) => !cancelled && d?.address && setAddress(d.address))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  function copyAddress() {
    if (!address) return
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/ledger/captures')
      .then((r) =>
        r.ok ? (r.json() as Promise<{ rows: CaptureRow[] }>) : Promise.reject(new Error(String(r.status))),
      )
      .then((d) => !cancelled && setAllRows(d.rows ?? []))
      .catch((e) => !cancelled && setError(String(e)))
    return () => {
      cancelled = true
    }
  }, [])

  const rows = allRows?.filter((r) => r.state !== 'dismissed') ?? null
  const dismissedCount = (allRows?.length ?? 0) - (rows?.length ?? 0)

  function dismiss(id: string) {
    // Optimistic: flip locally, revert on failure.
    setAllRows((prev) => prev?.map((r) => (r.id === id ? { ...r, state: 'dismissed' } : r)) ?? prev)
    fetch('/api/ledger/captures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, action: 'dismiss' }),
    })
      .then((r) => (r.ok ? null : Promise.reject(new Error(String(r.status)))))
      .catch(() => {
        setAllRows((prev) => prev?.map((r) => (r.id === id ? { ...r, state: 'captured' } : r)) ?? prev)
      })
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-sm text-red-600">Could not load the inbox: {error}</p>
      </div>
    )
  }
  if (rows === null) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    )
  }
  const addressLine = address ? (
    <p className="text-xs text-slate-400">
      Forward transaction emails (alerts, receipts — no attachments) to{' '}
      <button
        type="button"
        onClick={copyAddress}
        title="Copy address"
        className="font-mono text-slate-600 hover:text-teal-600"
      >
        {address}
      </button>
      {copied ? <span className="ml-1 text-emerald-600">copied</span> : null}
      {' · '}
      <Link href="/inbox/rules" className="text-teal-600 hover:underline">
        Rules
      </Link>
    </p>
  ) : null

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-slate-500 text-sm max-w-xs">
          Nothing to review. Captured statements and forwarded emails will queue here.
        </p>
        {addressLine}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">
        Captured ({rows.length})
      </p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-700">{r.filename ?? r.id}</p>
              <p className="text-xs text-slate-400">
                {r.source} · {fmtDate(r.created_at)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATE_STYLE[r.state] ?? STATE_STYLE.captured}`}
              >
                {r.state}
              </span>
              <Link
                href={`/editor?statement=${encodeURIComponent(r.id)}&filename=${encodeURIComponent(r.filename ?? r.id)}${r.prompt ? `&prompt=${encodeURIComponent(r.prompt)}` : ''}`}
                className="text-xs text-teal-600 hover:text-teal-700 whitespace-nowrap"
              >
                Review in chat →
              </Link>
              <button
                type="button"
                onClick={() => dismiss(r.id)}
                className="text-xs text-slate-400 hover:text-slate-600 whitespace-nowrap"
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-400">
        Uploads and forwarded transaction emails are captured here.
        {dismissedCount > 0 ? ` ${dismissedCount} dismissed item${dismissedCount === 1 ? '' : 's'} hidden.` : ''}
      </p>
      {addressLine}
    </div>
  )
}
