'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { AccountSummaryRow } from '@/durable/ledger-types'
import type { VaultStats } from '@/durable/ledger-do'
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

// Primary = the currency with the largest absolute amount; the rest noted.
function primaryOf<T extends { currency: string; total: number }>(
  rows: T[],
): { main: T | null; others: number } {
  return { main: rows[0] ?? null, others: Math.max(0, rows.length - 1) }
}

const fmtAmt = (n: number) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 })

// ── component ─────────────────────────────────────────────────────────────────

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; rows: AccountSummaryRow[] }

export function VaultView() {
  const [state, setState] = useState<FetchState>({ status: 'loading' })
  const [pendingCaptures, setPendingCaptures] = useState(0)
  const [names, setNames] = useState<Names>({})
  const [stats, setStats] = useState<VaultStats | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/ledger/vault-stats')
      .then((r) => (r.ok ? (r.json() as Promise<VaultStats>) : null))
      .then((d) => !cancelled && d && setStats(d))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

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

      {/* ── headline strip: numbers that mean something ───────────────────── */}
      {stats ? <HeadlineStrip stats={stats} /> : null}

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

      {/* ── spending this month ───────────────────────────────────────────── */}
      {stats && stats.expense_categories.length > 0 ? (
        <SpendingBreakdown stats={stats} />
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

// The three headline numbers (per primary currency; extra currencies noted):
// what you owe on cards, what you've spent this month, what's in the bank.
function HeadlineStrip({ stats }: { stats: VaultStats }) {
  const cards = primaryOf(stats.card_outstanding)
  const spend = primaryOf(stats.expense_total)
  const bank = primaryOf(stats.bank_total)
  // Liabilities are negative in beancount — owed is the flipped sign.
  const owed = cards.main ? -cards.main.total : 0
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StatTile
        label="Outstanding on cards"
        value={cards.main ? `${fmtAmt(owed)} ${cards.main.currency}` : '—'}
        sub={
          cards.main
            ? `${cards.main.accounts} card${cards.main.accounts === 1 ? '' : 's'}${cards.others ? ` · +${cards.others} ${cards.others === 1 ? 'currency' : 'currencies'}` : ''}`
            : 'no cards yet'
        }
        negative={owed > 0}
      />
      <StatTile
        label="Spent this month"
        value={spend.main ? `${fmtAmt(spend.main.total)} ${spend.main.currency}` : '0'}
        sub={spend.others ? `+${spend.others} more ${spend.others === 1 ? 'currency' : 'currencies'}` : 'month to date'}
      />
      <StatTile
        label="In the bank"
        value={bank.main ? `${fmtAmt(bank.main.total)} ${bank.main.currency}` : '—'}
        sub={bank.others ? `+${bank.others} more ${bank.others === 1 ? 'currency' : 'currencies'}` : 'across bank accounts'}
      />
    </div>
  )
}

// Month-to-date expenses by category, horizontal bars, each row drilling
// into that category's own overview page.
function SpendingBreakdown({ stats }: { stats: VaultStats }) {
  const main = stats.expense_total[0]
  if (!main) return null
  const cats = stats.expense_categories.filter((c) => c.currency === main.currency).slice(0, 8)
  const max = Math.max(...cats.map((c) => Math.abs(c.total)), 1)
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <SectionLabel>Spending this month</SectionLabel>
        <span className="font-mono text-xs text-muted-foreground">
          {fmtAmt(main.total)} {main.currency}
        </span>
      </div>
      <div className="space-y-2 rounded-xl border border-border bg-card p-5">
        {cats.map((c) => (
          <Link
            key={c.category}
            href={`/vault/account?account=${encodeURIComponent(`Expenses:${c.category}`)}&ccy=${encodeURIComponent(c.currency)}`}
            className="group block space-y-1"
          >
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-foreground group-hover:underline group-hover:underline-offset-4">
                {c.category}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {fmtAmt(c.total)} {c.currency}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground/70"
                style={{ width: `${Math.max(2, (Math.abs(c.total) / max) * 100)}%` }}
              />
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
