'use client'

import { useEffect, useRef, useState } from 'react'
import { CreditCard, Loader2, Search } from 'lucide-react'
import type { AddCardInput } from '@/durable/agent-ui-schemas'

type Candidate = { slug: string; name?: string | null }

type Guide = {
  ok: boolean
  card?: { slug: string; name: string | null }
  pool?: {
    name: string | null
    ticker: string | null
    account: string | null
    rate_notes: string | null
  } | null
}

export type AddCardResult = {
  ok: true
  card: string
  slug: string
  issuer: string | null
  liability_account: string
  wallet_account: string | null
  pool_ticker: string | null
  last4?: string
  opening_points?: number
}

// The KG-backed card picker: search cc nodes, show what the graph knows
// (issuer, reward pool, ticker, earn rate), collect optional last-4 and a
// current points balance, confirm. The result goes back as the tool output;
// the agent drafts the open directives through the normal review gate.
export function AddCardCard({
  input,
  status,
  onResult,
  onReject,
}: {
  input: AddCardInput
  status?: 'idle' | 'submitting' | 'done' | 'failed' | 'rejected'
  onResult?: (result: AddCardResult) => void
  onReject: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Candidate[]>(input.candidates ?? [])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<Candidate | null>(null)
  const [guide, setGuide] = useState<Guide | null>(null)
  const [guideLoading, setGuideLoading] = useState(false)
  const [guideError, setGuideError] = useState(false)
  const [last4, setLast4] = useState('')
  const [points, setPoints] = useState('')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const settled = status === 'done' || status === 'rejected'

  useEffect(() => {
    if (settled) return
    if (debounce.current) clearTimeout(debounce.current)
    const q = query.trim()
    if (q.length < 2) {
      setResults(input.candidates ?? [])
      return
    }
    debounce.current = setTimeout(() => {
      setSearching(true)
      fetch(`/api/kb/cards/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ items: Candidate[] }>) : null))
        .then((d) => d && setResults(d.items))
        .catch(() => {})
        .finally(() => setSearching(false))
    }, 250)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, settled])

  function pick(c: Candidate) {
    setSelected(c)
    setGuide(null)
    setGuideError(false)
    if (!c.name) return
    setGuideLoading(true)
    fetch(`/api/kb/card-guide?name=${encodeURIComponent(c.name)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Guide>) : Promise.reject(new Error(String(r.status)))))
      .then((g) => setGuide(g))
      .catch(() => setGuideError(true))
      .finally(() => setGuideLoading(false))
  }

  const issuer = guide?.pool?.account?.split(':').pop() ?? null
  const cardLeaf = selected?.name
    ? selected.name
        .split(/[^A-Za-z0-9]+/)
        .filter((t) => t && t.toLowerCase() !== (issuer ?? '').toLowerCase() && !['bank', 'credit', 'card'].includes(t.toLowerCase()))
        .map((t) => t[0]!.toUpperCase() + t.slice(1))
        .join('')
    : ''
  const liability =
    issuer && cardLeaf
      ? `Liabilities:CreditCards:${issuer}:${cardLeaf}${/^\d{4}$/.test(last4) ? `:${last4}` : ''}`
      : null

  function confirm() {
    if (!selected?.name || !liability || !onResult) return
    const pts = Number(points)
    onResult({
      ok: true,
      card: selected.name,
      slug: selected.slug,
      issuer,
      liability_account: liability,
      wallet_account: guide?.pool?.account ?? null,
      pool_ticker: guide?.pool?.ticker ?? null,
      ...(/^\d{4}$/.test(last4) ? { last4 } : {}),
      ...(Number.isFinite(pts) && pts > 0 ? { opening_points: Math.round(pts) } : {}),
    })
  }

  if (settled) {
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        {status === 'done' && selected?.name
          ? `Card selected: ${selected.name}`
          : status === 'done'
            ? 'Card selected.'
            : 'Dismissed.'}
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      {input.prompt ? (
        <p className="text-sm text-foreground">{input.prompt}</p>
      ) : (
        <p className="text-sm text-foreground">Which card should I add?</p>
      )}

      <label className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5">
        {searching ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : (
          <Search className="size-3.5 text-muted-foreground" />
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards (e.g. Magnus, Infinia, Atlas)…"
          className="flex-1 bg-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none"
        />
      </label>

      {results.length > 0 && !selected ? (
        <ul className="max-h-44 overflow-y-auto rounded-md border border-border">
          {results.map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                onClick={() => pick(c)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <CreditCard className="size-3.5 shrink-0 text-muted-foreground" />
                {c.name ?? c.slug}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{selected.name}</p>
            <button
              type="button"
              onClick={() => {
                setSelected(null)
                setGuide(null)
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              change
            </button>
          </div>
          {guideLoading ? (
            <p className="text-xs text-muted-foreground">Reading the knowledge graph…</p>
          ) : guideError ? (
            <p className="text-xs text-destructive" role="alert">
              Couldn’t load reward details.{' '}
              <button
                type="button"
                onClick={() => selected && pick(selected)}
                className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
              >
                Retry
              </button>
            </p>
          ) : guide?.ok && guide.pool ? (
            <dl className="space-y-1 text-xs text-muted-foreground">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0">Earns into</dt>
                <dd className="text-foreground">
                  {guide.pool.name ?? '—'}
                  {guide.pool.ticker ? (
                    <span className="ml-1 font-mono text-muted-foreground">{guide.pool.ticker}</span>
                  ) : null}
                </dd>
              </div>
              {guide.pool.rate_notes ? (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0">Earn rate</dt>
                  <dd className="line-clamp-2">{guide.pool.rate_notes}</dd>
                </div>
              ) : null}
              {liability ? (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0">Account</dt>
                  <dd className="font-mono">{liability}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">
              No reward details in the knowledge graph for this card yet.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="last 4 (optional)"
              className="w-32 rounded border border-border bg-background px-2 py-1 text-[12px] focus:border-foreground/50 focus:outline-none"
            />
            <input
              value={points}
              onChange={(e) => setPoints(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="current points (optional)"
              className="w-44 rounded border border-border bg-background px-2 py-1 text-[12px] focus:border-foreground/50 focus:outline-none"
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onReject}
          className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!selected || !liability || status === 'submitting'}
          className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 disabled:bg-muted disabled:text-muted-foreground"
        >
          Add this card
        </button>
      </div>
    </div>
  )
}
