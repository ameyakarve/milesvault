'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ProgrammeMark } from './programme-marks'
import { AddAccountsModal } from '@/components/add-accounts-modal'
import { cn } from '@/lib/utils'
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
import { SectionLabel, StatTile, CenteredState } from '@/components/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { BankMark } from './bank-marks'

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

// Mirrors the dashboard's shape (KPI strip + card grid) so the load doesn't
// pop in from a centered "Loading…" — far less reflow.
function VaultSkeleton() {
  return (
    <div className="space-y-8 p-4 sm:p-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function VaultView() {
  const [state, setState] = useState<FetchState>({ status: 'loading' })
  const [pendingCaptures, setPendingCaptures] = useState(0)
  const [addCardOpen, setAddCardOpen] = useState(false)
  const [names, setNames] = useState<Names>({})
  const [stats, setStats] = useState<VaultStats | null>(null)
  // Per-card KG/ledger metadata (network, reward identity, accrued cashback),
  // keyed by account. Loaded non-blocking — tiles render without it and enrich
  // when it arrives.
  const [cardMeta, setCardMeta] = useState<Record<string, CardMeta>>({})
  // Bumped by the error-state retry to re-run the loader.
  const [reloadNonce, setReloadNonce] = useState(0)

  // Load all home data, and REFETCH whenever the page regains focus/visibility
  // — balances change in the editor (statements, Update balance, Add accounts),
  // so returning to the home must show fresh values, not the mount-time
  // snapshot. `no-store` defeats the HTTP cache; the focus listener defeats the
  // router cache keeping this component mounted across navigations.
  useEffect(() => {
    let alive = true
    const noStore = { cache: 'no-store' as const }
    function load() {
      fetch('/api/ledger/vault-stats', noStore)
        .then((r) => (r.ok ? (r.json() as Promise<VaultStats>) : null))
        .then((d) => alive && d && setStats(d))
        .catch(() => {})
      fetch('/api/concierge/account-names', noStore)
        .then((r) => (r.ok ? (r.json() as Promise<{ names?: Names }>) : null))
        .then((d) => alive && d?.names && setNames(d.names))
        .catch(() => {})
      fetch('/api/ledger/captures', noStore)
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{ rows?: Array<{ state: string; draft_error: string | null }> }>)
            : null,
        )
        .then((d) => {
          if (!alive || !d) return
          const all = d.rows ?? []
          setPendingCaptures(
            all.filter(
              (c) =>
                c.state === 'extracted' ||
                (c.draft_error != null && c.state !== 'posted' && c.state !== 'dismissed'),
            ).length,
          )
        })
        .catch(() => {})
      fetch('/api/ledger/summaries', noStore)
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{ rows: AccountSummaryRow[] }>)
            : Promise.reject(new Error(`${r.status}`)),
        )
        .then((d) => alive && setState({ status: 'ok', rows: d.rows ?? [] }))
        .catch((e: unknown) => {
          if (alive)
            setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
        })
      fetch('/api/concierge/card-meta', noStore)
        .then((r) =>
          r.ok ? (r.json() as Promise<{ cards?: Array<{ card: string } & CardMeta> }>) : null,
        )
        .then((d) => {
          if (!alive || !d?.cards) return
          const m: Record<string, CardMeta> = {}
          for (const c of d.cards) m[c.card] = c
          setCardMeta(m)
        })
        .catch(() => {})
    }
    load()
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', load)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', load)
    }
  }, [reloadNonce])

  if (state.status === 'loading') {
    return <VaultSkeleton />
  }

  if (state.status === 'error') {
    return (
      <CenteredState tone="error" onRetry={() => setReloadNonce((n) => n + 1)}>
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
  // Programme holdings on the home = airline (Miles) + hotel/other (Points).
  // Issuer-direct card reward pools (Assets:Rewards:<Issuer>) now live on the
  // card tiles, so they're no longer shown as a separate cluster here — but
  // they're still excluded from "everything else" below (via isRewardish).
  const isProgrammeHolding = (a: string) =>
    a.startsWith('Assets:Rewards:Miles:') || a.startsWith('Assets:Rewards:Points:')
  const rewardRows = rows.filter((r) => isProgrammeHolding(r.account))
  const holdings = foldPending(rewardRows)
  // Tier-qualifying status counters keyed by programme leaf (the segment after
  // Assets:Rewards:Status:) — a programme can hold several commodities (nights,
  // segments, qualifying points), each its own row. Overlaid on the programme
  // tiles, so they're excluded from "everything else" below.
  const statusByProgramme = new Map<string, Array<{ value: number; commodity: string }>>()
  for (const r of rows) {
    if (!r.account.startsWith('Assets:Rewards:Status:')) continue
    const leaf = r.account.split(':')[3]
    if (!leaf) continue
    const value = Number(r.balance_scaled) / 10 ** r.scale
    const arr = statusByProgramme.get(leaf) ?? []
    arr.push({ value, commodity: r.currency })
    statusByProgramme.set(leaf, arr)
  }
  const cardRows = rows
    .filter((r) => r.account.startsWith('Liabilities:CreditCards:'))
    .sort((a, b) => a.account.localeCompare(b.account))
  const restRows = rows.filter(
    (r) =>
      !isRewardish(r.account) &&
      !r.account.startsWith('Assets:Rewards:Status:') &&
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
    <div className="px-6 py-6 max-w-5xl mx-auto w-full space-y-8">
      {/* ── needs review lane ─────────────────────────────────────────────── */}
      {pendingCaptures > 0 ? (
        <Link
          href="/inbox"
          className="flex items-center justify-between rounded-xl border border-amber-200/60 bg-amber-50 px-4 py-3 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:hover:bg-amber-950/60"
        >
          <span className="text-sm text-amber-800 dark:text-amber-300">
            {pendingCaptures} item{pendingCaptures === 1 ? '' : 's'} ready to review
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
            <button
              type="button"
              onClick={() => setAddCardOpen(true)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              + add
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cardRows.map((r) => (
              <CreditCardCard
                key={`${r.account}|${r.currency}`}
                row={r}
                names={names}
                trend={stats?.card_spend_trend.find((t) => t.account === r.account) ?? null}
                meta={cardMeta[r.account] ?? null}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── rewards: the hero, clustered by minting source (clusters always
          render — empty ones invite their first programme) ────────────────── */}
      <RewardsSections
        holdings={holdings}
        names={names}
        statusByProgramme={statusByProgramme}
        onAdd={() => setAddCardOpen(true)}
      />

      {/* ── spending this month ───────────────────────────────────────────── */}
      {stats && stats.expense_categories.length > 0 ? (
        <SpendingBreakdown stats={stats} />
      ) : null}

      <AddAccountsModal
        open={addCardOpen}
        onClose={() => setAddCardOpen(false)}
        onDone={() => setReloadNonce((n) => n + 1)}
      />
      {/* ── everything else, compact ──────────────────────────────────────── */}
      {orderedGroups.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
// Per-card KG + ledger metadata (from /api/concierge/card-meta), overlaid on
// the tile. The associated reward balance is uniform across points/cashback
// (we don't model that split) — `reward_unit` is a points ticker or a currency.
// All REAL: pool/receivable from the ledger, label/ticker from the KG.
type CardMeta = {
  reward_label: string | null
  reward_account: string | null
  reward_balance: number | null
  reward_pending: number | null
  reward_unit: string | null
}

// Full-color "card-art" background per bank — the whole tile takes the brand
// color (like the physical plastic / a Wallet card), white text overlaid. Real
// brand colors are public facts (not user data). Shades are chosen dark enough
// for white text and work over either app surface. Unknown issuers fall back to
// a deterministic muted color.
const BANK_BG: Record<string, string> = {
  hdfc: 'bg-blue-700',
  axis: 'bg-rose-800',
  icici: 'bg-orange-700',
  sbi: 'bg-sky-700',
  sbicard: 'bg-sky-700',
  hsbc: 'bg-red-700',
  indusind: 'bg-rose-900',
  amex: 'bg-cyan-800',
  americanexpress: 'bg-cyan-800',
  kotak: 'bg-red-700',
  idfc: 'bg-fuchsia-900',
  idfcfirst: 'bg-fuchsia-900',
  yes: 'bg-blue-700',
  yesbank: 'bg-blue-700',
  rbl: 'bg-amber-800',
  au: 'bg-purple-800',
  aubank: 'bg-purple-800',
  sc: 'bg-emerald-800',
  standardchartered: 'bg-emerald-800',
  citi: 'bg-blue-800',
  citibank: 'bg-blue-800',
}
const FALLBACK_BG = ['bg-slate-700', 'bg-zinc-700', 'bg-stone-700', 'bg-neutral-700']
function issuerOf(account: string): string | null {
  // Liabilities:CreditCards:<Issuer>:<Card>[:last4]
  return account.split(':')[2] ?? null
}
function bankBg(issuer: string | null): string {
  const key = (issuer ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (key && BANK_BG[key]) return BANK_BG[key]!
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return FALLBACK_BG[Math.abs(h) % FALLBACK_BG.length]!
}

// Area sparkline (monthly spend, oldest→newest): the line's SLOPE shows the
// trend direction; the filled area gives it weight. currentColor (white on the
// card), low-opacity fill + solid stroke.
function Sparkarea({ values, className }: { values: number[]; className?: string }) {
  const w = 64
  const h = 20
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const n = values.length
  const step = n > 1 ? w / (n - 1) : w
  const xy = values.map((v, i) => [i * step, h - 2 - ((v - min) / range) * (h - 4)] as const)
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `0,${h} ${line} ${w},${h}`
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polygon points={area} fill="currentColor" opacity="0.25" />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function fmtReward(v: number, unit: string | null): string {
  const n = v.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  return unit === 'INR' ? `₹${n}` : `${n} ${unit ?? 'pts'}`
}

export function CreditCardCard({
  row,
  names,
  trend,
  meta,
}: {
  row: AccountSummaryRow
  names: Names
  trend: { currency: string; months: number[] } | null
  meta: CardMeta | null
}) {
  const { name, suffix } = displayName(row.account, names)
  const issuer = issuerOf(row.account)
  const bal = balanceOf(row)
  const owed = bal < 0
  const inCredit = bal > 0
  const stateLabel = owed ? 'Outstanding' : inCredit ? 'In credit' : 'Settled'
  const magnitude = Math.abs(bal).toLocaleString('en-IN', {
    maximumFractionDigits: row.scale > 0 ? 2 : 0,
  })

  // Spend, month over month: the current month's charges + the delta vs the
  // prior month, both from the monthly series the area chart draws.
  const series = trend?.months ?? []
  const spendCcy = trend?.currency ?? 'INR'
  const thisMo = series[series.length - 1] ?? 0
  const prevMo = series[series.length - 2] ?? 0
  const deltaPct = prevMo > 0 ? Math.round(((thisMo - prevMo) / prevMo) * 100) : null
  const spendText = `${fmtAmt(thisMo)}${spendCcy !== 'INR' ? ` ${spendCcy}` : ''}`

  return (
    <Link
      href={accountHref(row)}
      className={cn(
        'group flex flex-col gap-3 rounded-xl p-4 text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-lg',
        bankBg(issuer),
      )}
    >
      {/* identity — mark, card name, last 4 */}
      <span className="flex items-center gap-2">
        <BankMark issuer={issuer} className="size-5 shrink-0 text-white" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
        <span className="shrink-0 font-mono text-[10px] tracking-wider text-white/70">
          •••• {suffix || '----'}
        </span>
      </span>

      {/* outstanding hero */}
      <span className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-wide text-white/60">{stateLabel}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-semibold leading-none tracking-tight">
            {magnitude}
          </span>
          <span className="font-mono text-[10px] text-white/60">{row.currency}</span>
        </span>
      </span>

      {/* monthly spend + area trend */}
      <span className="flex items-end justify-between gap-2">
        <span className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-white/60">Monthly spend</span>
          <span className="flex items-baseline gap-1">
            <span className="font-mono text-xs">{spendText}</span>
            {deltaPct != null && deltaPct !== 0 ? (
              <span className="font-mono text-[10px] text-white/70" title="vs last month">
                {deltaPct > 0 ? '▲' : '▼'}
                {Math.abs(deltaPct)}%
              </span>
            ) : null}
          </span>
        </span>
        {series.length > 1 ? <Sparkarea values={series} className="h-6 w-16 text-white" /> : null}
      </span>

      {/* reward balance — no programme label (the card already names it);
          just the balance + a friendly unit, pending only when positive */}
      {meta?.reward_balance != null ? (
        <span className="flex items-baseline gap-1 border-t border-white/20 pt-2 text-[11px]">
          <span className="font-mono">{fmtReward(meta.reward_balance, meta.reward_unit)}</span>
          {meta.reward_pending != null && meta.reward_pending > 0 ? (
            <span className="font-mono text-[10px] text-white/60">
              · {meta.reward_pending.toLocaleString('en-IN', { maximumFractionDigits: 0 })} pending
            </span>
          ) : null}
        </span>
      ) : null}
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
    <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2 shadow-sm">
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

// Two headline numbers relevant to a rewards/spend tracker: what you owe on
// cards and what you've spent this month. (No "net worth / in the bank" — this
// isn't a net-worth app; account balances live on the cards and Accounts tab.)
function HeadlineStrip({ stats }: { stats: VaultStats }) {
  const cards = primaryOf(stats.card_outstanding)
  const spend = primaryOf(stats.expense_total)
  // Liabilities are negative in beancount — owed is the flipped sign.
  const owed = cards.main ? -cards.main.total : 0
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <StatTile
        label="Card balances"
        value={cards.main ? `${fmtAmt(cards.main.total)} ${cards.main.currency}` : '—'}
        sub={
          stats.card_count > 0
            ? `${stats.card_count} card${stats.card_count === 1 ? '' : 's'}`
            : 'no cards yet'
        }
        negative={owed > 0}
      />
      <StatTile
        label="Spent this month"
        value={spend.main ? `${fmtAmt(spend.main.total)} ${spend.main.currency}` : '0'}
        sub="month to date"
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
      <div className="space-y-2.5 rounded-xl border border-border bg-card p-4 shadow-sm">
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
  // (Issuer-direct card reward pools are shown on the card tiles, not here.)
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

function RewardsSections({
  holdings,
  names,
  statusByProgramme,
  onAdd,
}: {
  holdings: Holding[]
  names: Names
  statusByProgramme: Map<string, Array<{ value: number; commodity: string }>>
  onAdd: () => void
}) {
  const claimed = new Set<string>()
  return (
    <>
      {REWARD_CLUSTERS.map(({ prefix, label, cta, seed }) => {
        const cluster = holdings.filter((h) => h.account.startsWith(prefix))
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {cluster.map((h) => (
                  <ProgrammeCard
                    key={`${h.account}|${h.currency}`}
                    holding={h}
                    names={names}
                    status={statusByProgramme.get(h.account.split(':')[3] ?? '') ?? []}
                  />
                ))}
              </div>
            ) : (
              <Link
                href={`/editor?prefill=${encodeURIComponent(seed)}`}
                className="flex items-center justify-between rounded-xl border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
// Programme brand color (airline / hotel) for the full-color tile — same idea
// as the bank card art. Best-effort curated palette keyed by the programme
// leaf; deterministic fallback for the rest.
const PROGRAMME_BG: Record<string, string> = {
  marriott: 'bg-rose-900',
  bonvoy: 'bg-rose-900',
  hilton: 'bg-blue-800',
  honors: 'bg-blue-800',
  hyatt: 'bg-blue-900',
  ihg: 'bg-orange-700',
  accor: 'bg-indigo-800',
  taj: 'bg-emerald-800',
  ihcl: 'bg-emerald-800',
  krisflyer: 'bg-indigo-900',
  singapore: 'bg-indigo-900',
  emirates: 'bg-red-800',
  skywards: 'bg-red-800',
  qatar: 'bg-purple-900',
  lufthansa: 'bg-blue-900',
  milesandmore: 'bg-blue-900',
  avios: 'bg-sky-800',
  british: 'bg-sky-800',
  united: 'bg-blue-800',
  mileageplus: 'bg-blue-800',
  airindia: 'bg-red-800',
  maharaja: 'bg-red-800',
  vistara: 'bg-purple-800',
  etihad: 'bg-amber-800',
  flyingblue: 'bg-blue-900',
  qantas: 'bg-red-800',
}
const FALLBACK_PROGRAMME_BG = [
  'bg-slate-700',
  'bg-zinc-700',
  'bg-stone-700',
  'bg-teal-800',
  'bg-indigo-800',
]
function programmeBg(account: string): string {
  const leaf = (account.split(':').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const key of Object.keys(PROGRAMME_BG)) if (leaf.includes(key)) return PROGRAMME_BG[key]!
  let h = 0
  for (let i = 0; i < leaf.length; i++) h = (h * 31 + leaf.charCodeAt(i)) | 0
  return FALLBACK_PROGRAMME_BG[Math.abs(h) % FALLBACK_PROGRAMME_BG.length]!
}
// The status commodity is `<PROGRAMME>-<TYPE>` (e.g. MAR-NIGHTS) — the human
// unit is the type, lowercased: "nights", "status", "segments".
function statusUnit(commodity: string): string {
  const t = commodity.includes('-') ? commodity.slice(commodity.lastIndexOf('-') + 1) : commodity
  return t.toLowerCase()
}

// One loyalty programme as full-color card art (airline = plane, hotel/other =
// hotel). Points/miles balance is the hero; tier-qualifying progress counters
// (Assets:Rewards:Status:<Programme>) ride along on the footer — there can be
// several (nights + segments + qualifying points), so they wrap.
export function ProgrammeCard({
  holding,
  names,
  status = [],
}: {
  holding: Holding
  names: Names
  status?: Array<{ value: number; commodity: string }>
}) {
  const { name } = displayName(holding.account, names)
  const fmtPts = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  const kind: 'miles' | 'points' = holding.account.startsWith('Assets:Rewards:Miles:')
    ? 'miles'
    : 'points'
  const unitLabel = kind === 'miles' ? 'Miles' : 'Points'
  const ticker = currencyRedundant(name, holding.currency) ? null : holding.currency
  const counters = status.filter((s) => s.value !== 0)
  return (
    <Link
      href={`/vault/account?account=${encodeURIComponent(holding.account)}&ccy=${encodeURIComponent(holding.currency)}`}
      className={cn(
        'group flex flex-col gap-3 rounded-xl p-4 text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-lg',
        programmeBg(holding.account),
      )}
    >
      <span className="flex items-center gap-2">
        <ProgrammeMark account={holding.account} kind={kind} className="size-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
      </span>

      <span className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-wide text-white/60">{unitLabel}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-semibold leading-none tracking-tight">
            {fmtPts(holding.posted)}
          </span>
          {ticker ? <span className="font-mono text-[10px] text-white/60">{ticker}</span> : null}
          {holding.pending > 0 ? (
            <span className="ml-auto font-mono text-[10px] text-white/70">
              +{fmtPts(holding.pending)} pending
            </span>
          ) : null}
        </span>
      </span>

      {counters.length > 0 ? (
        <span className="flex flex-wrap gap-x-3 gap-y-0.5 border-t border-white/20 pt-2 font-mono text-[11px]">
          {counters.map((c) => (
            <span key={c.commodity}>
              {fmtPts(c.value)} <span className="text-white/60">{statusUnit(c.commodity)}</span>
            </span>
          ))}
        </span>
      ) : null}
    </Link>
  )
}

