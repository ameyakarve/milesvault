'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { AccountSummaryRow } from '@/durable/ledger-types'
import {
  accountLabel,
  groupLabel,
  groupRank,
  isHolding,
} from '@/lib/ledger-core/account-display'

// KG display names (cards, points) fetched once and overlaid on the
// path-derived labels — account path → display name.
type Names = Record<string, string>

function formatBalance(balanceScaled: string, scale: number): string {
  const val = Number(balanceScaled) / Math.pow(10, scale)
  return val.toLocaleString('en-IN', { maximumFractionDigits: scale > 0 ? 2 : 0 })
}

// ── stat helpers ─────────────────────────────────────────────────────────────

function totalPoints(rows: AccountSummaryRow[]): { total: number; currencies: Set<string> } {
  const currencies = new Set<string>()
  let total = 0
  for (const r of rows) {
    if (r.account.startsWith('Assets:Rewards:Points:')) {
      total += Number(r.balance_scaled) / Math.pow(10, r.scale)
      currencies.add(r.currency)
    }
  }
  return { total, currencies }
}

function countCreditCards(rows: AccountSummaryRow[]): number {
  const cards = new Set<string>()
  for (const r of rows) {
    if (r.account.startsWith('Liabilities:CreditCards:')) {
      cards.add(r.account)
    }
  }
  return cards.size
}

function countOpenAccounts(rows: AccountSummaryRow[]): number {
  return new Set(rows.map((r) => r.account)).size
}

// ── component ─────────────────────────────────────────────────────────────────

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; rows: AccountSummaryRow[] }

export function VaultView() {
  const [state, setState] = useState<FetchState>({ status: 'loading' })
  const [pendingCaptures, setPendingCaptures] = useState(0)
  const [names, setNames] = useState<Names>({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/concierge/account-names')
      .then((r) => (r.ok ? (r.json() as Promise<{ names?: Names }>) : null))
      .then((d) => !cancelled && d?.names && setNames(d.names))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/ledger/captures')
      .then((r) => (r.ok ? (r.json() as Promise<{ rows?: Array<{ state: string }> }>) : null))
      .then((d) => {
        if (cancelled || !d) return
        const all = d.rows ?? []
        setPendingCaptures(all.filter((c) => c.state === 'captured' || c.state === 'extracted').length)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/ledger/summaries')
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ rows: AccountSummaryRow[] }>)
          : Promise.reject(new Error(`${r.status}`)),
      )
      .then((d) => {
        if (!cancelled) setState({ status: 'ok', rows: d.rows ?? [] })
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-400 text-sm">
        Loading…
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-1 items-center justify-center text-red-500 text-sm">
        Failed to load vault: {state.message}
      </div>
    )
  }

  // Holdings only: Assets + Liabilities. Flow accounts (Income/Expenses) and
  // Equity plumbing never belong on the dashboard.
  const rows = state.rows.filter((r) => isHolding(r.account))

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-slate-500 text-sm max-w-xs">
          Your vault is empty — tell the Assistant about a card you hold, or drop a statement.
        </p>
        <Link
          href="/editor"
          className="text-teal-600 text-sm font-medium hover:underline"
        >
          Open the Journal
        </Link>
      </div>
    )
  }

  // ── stats ───────────────────────────────────────────────────────────────
  const pts = totalPoints(rows)
  const cardCount = countCreditCards(rows)
  const acctCount = countOpenAccounts(rows)

  // ── group rows by the taxonomy (deepest node label wins) ─────────────────
  const grouped = new Map<string, AccountSummaryRow[]>()
  for (const r of rows) {
    const k = groupLabel(r.account)
    const bucket = grouped.get(k) ?? []
    bucket.push(r)
    grouped.set(k, bucket)
  }
  const orderedGroups = [...grouped.keys()].sort(
    (a, b) => groupRank(a) - groupRank(b) || a.localeCompare(b),
  )

  return (
    <div className="px-6 py-6 max-w-4xl mx-auto w-full space-y-8">
      {/* ── needs review lane ─────────────────────────────────────────────── */}
      {pendingCaptures > 0 ? (
        <Link
          href="/inbox"
          className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 hover:bg-amber-100"
        >
          <span className="text-sm text-amber-800">
            Needs review: {pendingCaptures} captured item{pendingCaptures === 1 ? '' : 's'}
          </span>
          <span className="text-sm font-medium text-amber-700">Open Inbox →</span>
        </Link>
      ) : null}

      {/* ── headline strip ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile
          label="Total Points"
          value={`${pts.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })} pts`}
          sub={`across ${pts.currencies.size} ${pts.currencies.size === 1 ? 'currency' : 'currencies'}`}
        />
        <StatTile
          label="Credit Cards"
          value={String(cardCount)}
          sub={cardCount === 1 ? 'card' : 'cards'}
        />
        <StatTile
          label="Accounts"
          value={String(acctCount)}
          sub="open"
        />
      </div>

      {/* ── holdings groups ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {orderedGroups.map((key) => {
          const groupRows = grouped.get(key)
          if (!groupRows || groupRows.length === 0) return null
          return <HoldingsCard key={key} title={key} rows={groupRows} names={names} />
        })}
      </div>
    </div>
  )
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">{label}</p>
      <p className="text-2xl font-mono font-semibold text-slate-800 leading-none">{value}</p>
      <p className="text-xs text-slate-500 font-mono">{sub}</p>
    </div>
  )
}

function HoldingsCard({
  title,
  rows,
  names,
}: {
  title: string
  rows: AccountSummaryRow[]
  names: Names
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => {
          const { label, suffix } = accountLabel(r.account)
          const display = names[r.account] ?? label
          return (
            <li key={`${r.account}|${r.currency}`}>
              <Link
                href={`/vault/account?account=${encodeURIComponent(r.account)}&ccy=${encodeURIComponent(r.currency)}`}
                className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-slate-50 group"
              >
                <span className="text-sm text-slate-700 truncate group-hover:text-teal-600">
                  {display}
                  {suffix ? (
                    <span className="ml-1 font-mono text-[10px] text-slate-400">··{suffix}</span>
                  ) : null}
                </span>
                <span className="text-xs font-mono text-slate-500 whitespace-nowrap shrink-0">
                  {formatBalance(r.balance_scaled, r.scale)}{' '}
                  <span className="text-slate-400">{r.currency}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
