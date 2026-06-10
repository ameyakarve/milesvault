'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type CaptureRow = {
  id: string
  source: string
  artifact: string | null
  filename: string | null
  state: string
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
  const [rows, setRows] = useState<CaptureRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/ledger/captures')
      .then((r) =>
        r.ok ? (r.json() as Promise<{ rows: CaptureRow[] }>) : Promise.reject(new Error(String(r.status))),
      )
      .then((d) => !cancelled && setRows(d.rows ?? []))
      .catch((e) => !cancelled && setError(String(e)))
    return () => {
      cancelled = true
    }
  }, [])

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
  if (rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-slate-500 text-sm max-w-xs">
          Nothing to review. Captured statements and forwarded emails will queue here.
        </p>
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
                href="/editor"
                className="text-xs text-teal-600 hover:text-teal-700 whitespace-nowrap"
              >
                Review in chat →
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-400">
        Statements you upload in chat are captured here. Email forwarding and review workflows
        are on the way.
      </p>
    </div>
  )
}
