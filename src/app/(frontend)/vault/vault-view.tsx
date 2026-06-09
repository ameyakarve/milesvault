'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { AccountSummaryRow } from '@/durable/ledger-types'

// ── taxonomy helpers ────────────────────────────────────────────────────────

type GroupKey = 'Points' | 'Status' | 'Credit Cards' | 'Loaded' | 'Bank' | 'Other'

const GROUP_PREFIXES: { key: GroupKey; prefix: string }[] = [
  { key: 'Points', prefix: 'Assets:Rewards:Points:' },
  { key: 'Status', prefix: 'Assets:Rewards:Status:' },
  { key: 'Credit Cards', prefix: 'Liabilities:CreditCards:' },
  { key: 'Loaded', prefix: 'Assets:Loaded:' },
  { key: 'Bank', prefix: 'Assets:Bank:' },
]

function groupKey(account: string): GroupKey {
  for (const { key, prefix } of GROUP_PREFIXES) {
    if (account.startsWith(prefix)) return key
  }
  return 'Other'
}

// Leaf = last segment of the account path
function leafName(account: string): string {
  const parts = account.split(':')
  return parts[parts.length - 1]
}

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

  const { rows } = state

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

  // ── group rows ──────────────────────────────────────────────────────────
  const grouped = new Map<GroupKey, AccountSummaryRow[]>()
  for (const r of rows) {
    const k = groupKey(r.account)
    const bucket = grouped.get(k) ?? []
    bucket.push(r)
    grouped.set(k, bucket)
  }

  const GROUP_ORDER: GroupKey[] = ['Points', 'Status', 'Credit Cards', 'Loaded', 'Bank', 'Other']

  return (
    <div className="px-6 py-6 max-w-4xl mx-auto w-full space-y-8">
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
        {GROUP_ORDER.map((key) => {
          const groupRows = grouped.get(key)
          if (!groupRows || groupRows.length === 0) return null
          return (
            <HoldingsCard key={key} title={key} rows={groupRows} />
          )
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

function HoldingsCard({ title, rows }: { title: string; rows: AccountSummaryRow[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={`${r.account}|${r.currency}`}>
            <Link
              href={`/editor?tab=journal&account=${encodeURIComponent(r.account)}`}
              className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-slate-50 group"
            >
              <span className="text-sm text-slate-700 truncate group-hover:text-teal-600">
                {leafName(r.account)}
              </span>
              <span className="text-xs font-mono text-slate-500 whitespace-nowrap shrink-0">
                {formatBalance(r.balance_scaled, r.scale)}{' '}
                <span className="text-slate-400">{r.currency}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
