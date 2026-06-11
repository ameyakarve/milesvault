'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AddAccountsModal } from '@/components/add-accounts-modal'
import { UpdateBalanceModal } from '@/components/update-balance-modal'
import type { AccountSummaryRow } from '@/durable/ledger-types'
import type { VaultStats } from '@/durable/ledger-do'
import {
  baseAccount,
  currencyRedundant,
  displayName,
  groupLabel,
  groupRank,
  isHolding,
  isPending,
} from '@/lib/ledger-core/account-display'
import { SectionLabel, StatTile, CenteredState, Monogram } from '@/components/shared'

// KG display names (cards, points) fetched once and overlaid on the
// path-derived labels — account path → display name.
type Names = Record<string, string>

// A programme with its :Pending child folded in (docs/accounts-taxonomy.md).
type Holding = {
  account: string
  currency: string
  posted: number
  pending: number
}

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
  const [addCardOpen, setAddCardOpen] = useState(false)
  const [updateBalanceOpen, setUpdateBalanceOpen] = useState(false)
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

  // Holdings only: Assets + Liabilities. Flow accounts (Income/Expenses),
  // Equity plumbing, and clearing floats (Assets:Clearing:* — reconciliation
  // state that nets to zero once the counterpart statement arrives) never
  // belong on the dashboard.
  const rows = state.rows.filter(
    (r) => isHolding(r.account) && !r.account.startsWith('Assets:Clearing:'),
  )

  if (rows.length === 0) {
    return (
      <CenteredState
        action={{ label: 'Open the Journal', href: '/editor' }}
      >
        Your vault is empty — tell the Assistant about a card you hold, or drop a statement.
      </CenteredState>
    )
  }

  // ── hierarchy: rewards are the product (hero cards, clustered by the
  // taxonomy's minting-source subtrees), credit cards second, everything
  // else compact. :Pending children fold into their programme.
  // Everything under Assets:Rewards except Status is programme holdings —
  // accounts outside the Miles/Points/Cards subtrees surface in an explicit
  // "Unclassified" cluster (instead of vanishing into the compact lists).
  const isRewardish = (a: string) =>
    a.startsWith('Assets:Rewards:') && !a.startsWith('Assets:Rewards:Status:')
  const rewardRows = rows.filter((r) => isRewardish(r.account))
  const holdings = foldPending(rewardRows)
  const cardRows = rows
    .filter((r) => r.account.startsWith('Liabilities:CreditCards:'))
    .sort((a, b) => a.account.localeCompare(b.account))
  const restRows = rows.filter(
    (r) => !isRewardish(r.account) && !r.account.startsWith('Liabilities:CreditCards:'),
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

      {/* ── credit cards ──────────────────────────────────────────────────── */}
      {cardRows.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Credit cards</SectionLabel>
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              <button type="button" onClick={() => setUpdateBalanceOpen(true)} className="hover:text-foreground">
                update balance
              </button>
              <button type="button" onClick={() => setAddCardOpen(true)} className="hover:text-foreground">
                + add
              </button>
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {cardRows.map((r) => (
              <CreditCardCard
                key={`${r.account}|${r.currency}`}
                row={r}
                names={names}
                spend={stats?.card_spend.filter((s) => s.account === r.account) ?? null}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── rewards: the hero, clustered by minting source (clusters always
          render — empty ones invite their first programme) ────────────────── */}
      <RewardsSections holdings={holdings} names={names} onAdd={() => setAddCardOpen(true)} />

      {/* ── spending this month ───────────────────────────────────────────── */}
      {stats && stats.expense_categories.length > 0 ? (
        <SpendingBreakdown stats={stats} />
      ) : null}

      <AddAccountsModal open={addCardOpen} onClose={() => setAddCardOpen(false)} onDone={() => location.reload()} />
      <UpdateBalanceModal open={updateBalanceOpen} onClose={() => setUpdateBalanceOpen(false)} onDone={() => location.reload()} />
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
// Medium card: a credit card — monogram, issuer-qualified name, balance owed.
export function CreditCardCard({
  row,
  names,
  spend,
}: {
  row: AccountSummaryRow
  names: Names
  spend: Array<{ currency: string; total: number; window: 'statement' | 'month' }> | null
}) {
  const { name, suffix } = displayName(row.account, names)
  const bal = balanceOf(row)
  const expensesText = (spend && spend.length > 0
    ? spend
    : [{ currency: row.currency, total: 0, window: 'month' as const }]
  )
    .map(
      (s) =>
        `${s.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}${s.currency !== row.currency ? ` ${s.currency}` : ''}`,
    )
    .join(' + ')
  const windowText =
    (spend?.[0]?.window ?? 'month') === 'statement' ? 'last statement' : 'this month'
  return (
    <Link
      href={accountHref(row)}
      className="group block rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/25"
    >
      <span className="flex items-center gap-3">
        <Monogram name={name} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {name}
          {suffix ? (
            <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
              ··{suffix}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-right">
          <span
            className={`block whitespace-nowrap font-mono text-lg font-semibold ${bal < 0 ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            {formatBalance(row.balance_scaled, row.scale)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">{row.currency}</span>
          </span>
          <span className="block text-[11px] leading-4 text-muted-foreground">balance</span>
        </span>
      </span>
      <span className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
        <span>Expenses · {windowText}</span>
        <span className="font-mono">{expensesText} {row.currency}</span>
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
        label="Card balances"
        value={cards.main ? `${fmtAmt(cards.main.total)} ${cards.main.currency}` : '—'}
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

// Structural clusters straight off the account paths (the taxonomy's
// minting-source subtrees) — no KG round-trip needed.
const REWARD_CLUSTERS: Array<{ prefix: string; label: string; cta: string; seed: string }> = [
  {
    prefix: 'Assets:Rewards:Miles:',
    label: 'Airline programmes',
    cta: 'No airline programmes yet',
    seed: 'I want to track an airline frequent-flyer programme. Ask me which one and how many miles I hold, then open Assets:Rewards:Miles:<Programme> with the right ticker and record the balance.',
  },
  {
    prefix: 'Assets:Rewards:Points:',
    label: 'Hotel & other programmes',
    cta: 'No hotel programmes yet',
    seed: 'I want to track a hotel loyalty programme. Ask me which one and how many points I hold, then open Assets:Rewards:Points:<Programme> with the right ticker and record the balance.',
  },
  {
    // Issuer-direct wallets (owner convention): Assets:Rewards:<Issuer>
    // — matched as "under Assets:Rewards but not Miles/Points/Status".
    prefix: 'Assets:Rewards:',
    label: 'Card programmes',
    cta: 'No card reward pools yet',
    seed: 'I want to add a new credit card to track.',
  },
]

const NON_CARD_REWARD_PREFIXES = [
  'Assets:Rewards:Miles:',
  'Assets:Rewards:Points:',
  'Assets:Rewards:Status:',
]

// Fold :Pending children into their programme: one Holding per
// (programme account, commodity) with posted and pending split out.
function foldPending(rows: AccountSummaryRow[]): Holding[] {
  const map = new Map<string, Holding>()
  for (const r of rows) {
    const base = baseAccount(r.account)
    const key = `${base}|${r.currency}`
    const h = map.get(key) ?? { account: base, currency: r.currency, posted: 0, pending: 0 }
    const val = Number(r.balance_scaled) / 10 ** r.scale
    if (isPending(r.account)) h.pending += val
    else h.posted += val
    map.set(key, h)
  }
  return [...map.values()].sort((a, b) => b.posted + b.pending - (a.posted + a.pending))
}

function RewardsSections({ holdings, names, onAdd }: { holdings: Holding[]; names: Names; onAdd: () => void }) {
  const claimed = new Set<string>()
  return (
    <>
      {REWARD_CLUSTERS.map(({ prefix, label, cta, seed }) => {
        const cluster = holdings.filter(
          (h) =>
            h.account.startsWith(prefix) &&
            // The card cluster's prefix is the bare Assets:Rewards: — it
            // owns everything the named clusters don't.
            (prefix !== 'Assets:Rewards:' ||
              !NON_CARD_REWARD_PREFIXES.some((p) => h.account.startsWith(p))),
        )
        cluster.forEach((h) => claimed.add(`${h.account}|${h.currency}`))
        return (
          <section key={prefix} className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel>{label}</SectionLabel>
              <button
                type="button"
                onClick={onAdd}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                + add
              </button>
            </div>
            {cluster.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cluster.map((h) => (
                  <ProgrammeCard key={`${h.account}|${h.currency}`} holding={h} names={names} />
                ))}
              </div>
            ) : (
              <Link
                href={`/editor?prefill=${encodeURIComponent(seed)}`}
                className="flex items-center justify-between rounded-xl border border-dashed border-border px-5 py-4 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <span>{cta}</span>
                <span className="shrink-0 text-xs">Add in the Ledger chat →</span>
              </Link>
            )}
          </section>
        )
      })}
      {(() => {
        const legacy = holdings.filter((h) => !claimed.has(`${h.account}|${h.currency}`))
        if (legacy.length === 0) return null
        return (
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <SectionLabel>Unclassified rewards</SectionLabel>
              <span className="text-xs text-muted-foreground">
                move under Rewards:Miles / Points / Cards to classify
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {legacy.map((h) => (
                <ProgrammeCard key={`${h.account}|${h.currency}`} holding={h} names={names} />
              ))}
            </div>
          </section>
        )
      })()}
    </>
  )
}

// Hero card: one programme — monogram, resolved name, posted balance big,
// pending called out when present.
function ProgrammeCard({ holding, names }: { holding: Holding; names: Names }) {
  const { name } = displayName(holding.account, names)
  const fmtPts = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  return (
    <Link
      href={`/vault/account?account=${encodeURIComponent(holding.account)}&ccy=${encodeURIComponent(holding.currency)}`}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/25"
    >
      <div className="flex items-center gap-3">
        <Monogram name={name} size="lg" />
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-semibold leading-none text-foreground">
          {fmtPts(holding.posted)}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {currencyRedundant(name, holding.currency) ? 'pts' : holding.currency}
        </span>
        {holding.pending > 0 ? (
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            +{fmtPts(holding.pending)} pending
          </span>
        ) : null}
      </div>
    </Link>
  )
}

