'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { AccountSummaryRow } from '@/durable/ledger-types'
import {
  currencyRedundant,
  displayName,
  groupLabel,
  groupRank,
  isHolding,
} from '@/lib/ledger-core/account-display'
import { SectionLabel, StatTile, CenteredState, Monogram } from '@/components/shared'

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
    return <CenteredState>Loading…</CenteredState>
  }

  if (state.status === 'error') {
    return (
      <CenteredState tone="error">
        Failed to load vault: {state.message}
      </CenteredState>
    )
  }

  // Holdings only: Assets + Liabilities. Flow accounts (Income/Expenses) and
  // Equity plumbing never belong on the dashboard.
  const rows = state.rows.filter((r) => isHolding(r.account))

  if (rows.length === 0) {
    return (
      <CenteredState
        action={{ label: 'Open the Journal', href: '/editor' }}
      >
        Your vault is empty — tell the Assistant about a card you hold, or drop a statement.
      </CenteredState>
    )
  }

  // ── stats ───────────────────────────────────────────────────────────────
  const pts = totalPoints(rows)
  const cardCount = countCreditCards(rows)
  const acctCount = countOpenAccounts(rows)

  // ── hierarchy: points are the product (hero cards), credit cards second
  // (medium cards), everything else compact lists grouped by taxonomy.
  const pointRows = rows
    .filter((r) => r.account.startsWith('Assets:Rewards:Points:'))
    .sort((a, b) => balanceOf(b) - balanceOf(a))
  const cardRows = rows
    .filter((r) => r.account.startsWith('Liabilities:CreditCards:'))
    .sort((a, b) => a.account.localeCompare(b.account))
  const restRows = rows.filter(
    (r) =>
      !r.account.startsWith('Assets:Rewards:Points:') &&
      !r.account.startsWith('Liabilities:CreditCards:'),
  )
  const grouped = new Map<string, AccountSummaryRow[]>()
  for (const r of restRows) {
    const k = groupLabel(r.account)
    const bucket = grouped.get(k) ?? []
    bucket.push(r)
    grouped.set(k, bucket)
  }
  const orderedGroups = [...grouped.keys()].sort(
    (a, b) => groupRank(a) - groupRank(b) || a.localeCompare(b),
  )

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto w-full space-y-10">
      {/* ── needs review lane ─────────────────────────────────────────────── */}
      {pendingCaptures > 0 ? (
        <Link
          href="/inbox"
          className="flex items-center justify-between rounded-xl border border-amber-200/60 bg-amber-50 px-4 py-3 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:hover:bg-amber-950/60"
        >
          <span className="text-sm text-amber-800 dark:text-amber-300">
            Needs review: {pendingCaptures} captured item{pendingCaptures === 1 ? '' : 's'}
          </span>
          <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Open Inbox →</span>
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

      {/* ── points: the hero ──────────────────────────────────────────────── */}
      {pointRows.length > 0 ? (
        <section className="space-y-3">
          <SectionLabel>Points</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pointRows.map((r) => (
              <ProgrammeCard key={`${r.account}|${r.currency}`} row={r} names={names} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── credit cards ──────────────────────────────────────────────────── */}
      {cardRows.length > 0 ? (
        <section className="space-y-3">
          <SectionLabel>Credit cards</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {cardRows.map((r) => (
              <CreditCardCard key={`${r.account}|${r.currency}`} row={r} names={names} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── everything else, compact ──────────────────────────────────────── */}
      {orderedGroups.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orderedGroups.map((key) => {
            const groupRows = grouped.get(key)
            if (!groupRows || groupRows.length === 0) return null
            return <HoldingsCard key={key} title={key} rows={groupRows} names={names} />
          })}
        </div>
      ) : null}
    </div>
  )
}

function balanceOf(r: AccountSummaryRow): number {
  return Number(r.balance_scaled) / 10 ** r.scale
}

function accountHref(r: AccountSummaryRow): string {
  return `/vault/account?account=${encodeURIComponent(r.account)}&ccy=${encodeURIComponent(r.currency)}`
}

// Hero card: one loyalty programme — monogram, resolved name, big balance.
function ProgrammeCard({ row, names }: { row: AccountSummaryRow; names: Names }) {
  const { name } = displayName(row.account, names)
  return (
    <Link
      href={accountHref(row)}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/25"
    >
      <div className="flex items-center gap-3">
        <Monogram name={name} size="lg" />
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-semibold leading-none text-foreground">
          {formatBalance(row.balance_scaled, row.scale)}
        </span>
        {!currencyRedundant(name, row.currency) ? (
          <span className="font-mono text-xs text-muted-foreground">{row.currency}</span>
        ) : (
          <span className="font-mono text-xs text-muted-foreground">pts</span>
        )}
      </div>
    </Link>
  )
}

// Medium card: a credit card — monogram, issuer-qualified name, balance owed.
function CreditCardCard({ row, names }: { row: AccountSummaryRow; names: Names }) {
  const { name, suffix } = displayName(row.account, names)
  const bal = balanceOf(row)
  return (
    <Link
      href={accountHref(row)}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/25"
    >
      <Monogram name={name} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {name}
        {suffix ? (
          <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
            ··{suffix}
          </span>
        ) : null}
      </span>
      <span
        className={`shrink-0 font-mono text-lg font-semibold ${bal < 0 ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {formatBalance(row.balance_scaled, row.scale)}
        <span className="ml-1 text-xs font-normal text-muted-foreground">{row.currency}</span>
      </span>
    </Link>
  )
}

// ── sub-components ────────────────────────────────────────────────────────────

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
    <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
      <SectionLabel>{title}</SectionLabel>
      <ul className="space-y-1">
        {rows.map((r) => {
          const { name: display, suffix } = displayName(r.account, names)
          return (
            <li key={`${r.account}|${r.currency}`}>
              <Link
                href={accountHref(r)}
                className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-muted group"
              >
                <span className="text-sm text-foreground truncate group-hover:underline group-hover:underline-offset-4">
                  {display}
                  {suffix ? (
                    <span className="ml-1 font-mono text-[10px] text-muted-foreground">··{suffix}</span>
                  ) : null}
                </span>
                <span className="text-xs font-mono text-muted-foreground whitespace-nowrap shrink-0">
                  {formatBalance(r.balance_scaled, r.scale)}
                  {!currencyRedundant(display, r.currency) ? (
                    <span className="ml-1 text-muted-foreground/70">{r.currency}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
