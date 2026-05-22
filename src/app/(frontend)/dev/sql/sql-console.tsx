'use client'

import { useEffect, useRef, useState } from 'react'

type Result = {
  columns: string[]
  rows: Array<Record<string, unknown>>
  truncated: boolean
  rows_written: number
}

const RECENT_KEY = 'milesvault:dev-sql:recent'
const RECENT_MAX = 20

export function SqlConsole() {
  const [sql, setSql] = useState<string>(
    'SELECT COUNT(*) AS n_postings, SUM(amount IS NULL) AS null_amount, SUM(currency IS NULL) AS null_currency FROM postings',
  )
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY)
      if (raw) setRecent(JSON.parse(raw) as string[])
    } catch {}
  }, [])

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ledger/admin/sql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql }),
      })
      const txt = await res.text()
      let json: unknown
      try {
        json = JSON.parse(txt)
      } catch {
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 300)}`)
      }
      if (!res.ok) {
        const err = (json as { error?: string }).error
        throw new Error(err ?? `HTTP ${res.status}`)
      }
      setResult(json as Result)
      const next = [sql, ...recent.filter((s) => s !== sql)].slice(0, RECENT_MAX)
      setRecent(next)
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void run()
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="w-[240px] shrink-0 overflow-y-auto border-r border-slate-200 p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">Recent</div>
        {recent.length === 0 && (
          <div className="text-xs text-slate-400">Run a query to see it here.</div>
        )}
        <ul className="flex flex-col gap-1">
          {recent.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  setSql(s)
                  taRef.current?.focus()
                }}
                className="block w-full truncate rounded-[6px] px-2 py-1 text-left text-xs text-slate-600 hover:bg-slate-100"
                title={s}
              >
                {s.replace(/\s+/g, ' ').trim()}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-3">
          <textarea
            ref={taRef}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            className="h-[140px] w-full resize-none rounded-[8px] border border-slate-200 bg-white p-3 font-mono text-xs text-slate-900 outline-none focus:border-teal-500"
          />
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button
              type="button"
              onClick={run}
              disabled={loading}
              className="rounded-[6px] bg-teal-500 px-3 py-1 text-xs text-white transition hover:bg-teal-600 disabled:opacity-50"
            >
              {loading ? 'Running…' : 'Run'}
            </button>
            <span className="text-slate-400">⌘/Ctrl + Enter</span>
            {result && (
              <span className="ml-auto">
                {result.rows_written > 0 && (
                  <span className="mr-2 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">
                    {result.rows_written.toLocaleString()} rows written
                  </span>
                )}
                {result.rows.length.toLocaleString()} rows
                {result.truncated && (
                  <span className="ml-2 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                    truncated at 1000
                  </span>
                )}
              </span>
            )}
          </div>
          {error && <div className="text-xs text-rose-600">{error}</div>}
        </div>
        <ResultGrid result={result} />
      </section>
    </div>
  )
}

function ResultGrid({ result }: { result: Result | null }) {
  if (!result) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-slate-400">
        No results yet.
      </div>
    )
  }
  if (result.rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-slate-400">
        Query returned no rows.
      </div>
    )
  }
  return (
    <div className="flex-1 overflow-auto">
      <table className="min-w-full text-xs tabular-nums">
        <thead className="sticky top-0 bg-white border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
          <tr>
            {result.columns.map((c) => (
              <th key={c} className="px-3 py-2 font-normal">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
              {result.columns.map((c) => (
                <td key={c} className="px-3 py-1.5 text-slate-700 align-top">
                  {renderCell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderCell(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
