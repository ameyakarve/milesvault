'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
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
import { SectionLabel, StatTile, CenteredState, Monogram, StateChip } from '@/components/shared'
import { Skeleton } from '@/components/ui/skeleton'

// Shared card frame: compact, hairline border, a hint of depth, and a hover
// lift. The monogram carries each card's per-programme tint — no extra accent
// rule (a straight bar reads wrong against the rounded corner). Reused by the
// programme + credit-card cells.
const CARD_FRAME =
  'group flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5 shadow-sm transition-all duration-150 hover:-translate-y-px hover:border-foreground/20 hover:shadow-md'

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
                spend={stats?.card_spend.filter((s) => s.account === r.account) ?? null}
                trend={stats?.card_spend_trend.find((t) => t.account === r.account)?.months ?? null}
                meta={cardMeta[r.account] ?? null}
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

// Curated bank brand tints for the card-art header band — real brand colors are
// public facts (not user data). Keyed off the issuer segment of the account;
// unknown issuers fall back to a deterministic neutral gradient.
const BANK_BANDS: Record<string, string> = {
  hdfc: 'from-blue-800 to-blue-950',
  axis: 'from-rose-800 to-rose-950',
  icici: 'from-orange-700 to-orange-900',
  sbi: 'from-sky-700 to-blue-900',
  sbicard: 'from-sky-700 to-blue-900',
  hsbc: 'from-red-700 to-red-950',
  indusind: 'from-rose-900 to-red-950',
  amex: 'from-cyan-700 to-blue-900',
  americanexpress: 'from-cyan-700 to-blue-900',
  kotak: 'from-red-700 to-rose-900',
  idfc: 'from-fuchsia-900 to-rose-950',
  idfcfirst: 'from-fuchsia-900 to-rose-950',
  yes: 'from-blue-700 to-indigo-900',
  yesbank: 'from-blue-700 to-indigo-900',
  rbl: 'from-amber-700 to-red-900',
  au: 'from-fuchsia-800 to-purple-950',
  aubank: 'from-fuchsia-800 to-purple-950',
  sc: 'from-emerald-700 to-blue-900',
  standardchartered: 'from-emerald-700 to-blue-900',
  citi: 'from-blue-700 to-blue-950',
  citibank: 'from-blue-700 to-blue-950',
}
const FALLBACK_BANDS = [
  'from-slate-700 to-slate-900',
  'from-zinc-700 to-zinc-900',
  'from-stone-700 to-stone-900',
  'from-neutral-700 to-neutral-900',
]
function issuerOf(account: string): string | null {
  // Liabilities:CreditCards:<Issuer>:<Card>[:last4]
  return account.split(':')[2] ?? null
}
function bankBand(issuer: string | null): string {
  const key = (issuer ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (key && BANK_BANDS[key]) return BANK_BANDS[key]!
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return FALLBACK_BANDS[Math.abs(h) % FALLBACK_BANDS.length]!
}

// Tiny bar sparkline (monthly spend, oldest→newest). Bars use the current text
// color at low opacity; a zero month keeps a sliver so the axis reads.
function Sparkbars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1)
  return (
    <span className="inline-flex h-3.5 items-end gap-px" aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className="w-1 rounded-sm bg-current/40"
          style={{ height: `${Math.max(10, (v / max) * 100)}%` }}
        />
      ))}
    </span>
  )
}

function fmtReward(v: number, unit: string | null): string {
  const n = v.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  return unit === 'INR' ? `₹${n}` : `${n} ${unit ?? 'pts'}`
}

export function CreditCardCard({
  row,
  names,
  spend,
  trend,
  meta,
}: {
  row: AccountSummaryRow
  names: Names
  spend: Array<{ currency: string; total: number }> | null
  trend: number[] | null
  meta: CardMeta | null
}) {
  const { name, suffix } = displayName(row.account, names)
  const issuer = issuerOf(row.account)
  const bal = balanceOf(row)
  const owed = bal < 0
  const inCredit = bal > 0
  // Liabilities are stored negative when you owe — label the direction so the
  // bare number isn't ambiguous, and show the magnitude (the label carries sign).
  const stateLabel = owed ? 'Outstanding' : inCredit ? 'In credit' : 'Settled'
  const magnitude = Math.abs(bal).toLocaleString('en-IN', {
    maximumFractionDigits: row.scale > 0 ? 2 : 0,
  })

  // Spend: the dominant-currency total over the window + a month-over-month
  // delta from the trailing trend series.
  const spendRows = spend && spend.length ? spend : [{ currency: row.currency, total: 0 }]
  const primarySpend = [...spendRows].sort((a, b) => Math.abs(b.total) - Math.abs(a.total))[0]!
  const spendText = `${fmtAmt(primarySpend.total)}${primarySpend.currency !== 'INR' ? ` ${primarySpend.currency}` : ''}`
  const series = trend ?? []
  const last = series[series.length - 1] ?? 0
  const prev = series[series.length - 2] ?? 0
  const deltaPct = prev > 0 ? Math.round(((last - prev) / prev) * 100) : null

  return (
    <Link
      href={accountHref(row)}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md"
    >
      {/* card-art band — bank brand color, wordmark, last 4 */}
      <span className={cn('flex flex-col gap-0.5 bg-gradient-to-br px-3.5 py-2.5 text-white', bankBand(issuer))}>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-semibold uppercase tracking-wider opacity-90">
            {issuer ?? name}
          </span>
          <span className="shrink-0 font-mono text-[10px] tracking-wider opacity-80">
            •••• {suffix || '----'}
          </span>
        </span>
        <span className="truncate text-sm font-medium">{name}</span>
      </span>

      {/* body — outstanding, spend trend, reward balance */}
      <span className="flex flex-col gap-2 px-3.5 py-3">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {stateLabel}
          </span>
          <span className="flex items-baseline gap-1">
            <span
              className={cn(
                'font-mono text-lg font-semibold leading-none tracking-tight',
                inCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
              )}
            >
              {magnitude}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">{row.currency}</span>
          </span>
        </span>

        <span className="flex items-center justify-between gap-2 text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="text-[10px] uppercase tracking-wide">Spend</span>
            {series.length > 1 ? <Sparkbars values={series} /> : null}
          </span>
          <span className="flex items-baseline gap-1">
            <span className="font-mono text-foreground">{spendText}</span>
            {deltaPct != null && deltaPct !== 0 ? (
              <span className="font-mono text-[10px] text-muted-foreground">
                {deltaPct > 0 ? '▲' : '▼'}
                {Math.abs(deltaPct)}%
              </span>
            ) : null}
          </span>
        </span>

        {meta?.reward_label ? (
          <span className="flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[11px]">
            <span className="truncate text-muted-foreground">{meta.reward_label}</span>
            <span className="flex shrink-0 items-baseline gap-1">
              {meta.reward_balance != null ? (
                <span className="font-mono text-foreground">
                  {fmtReward(meta.reward_balance, meta.reward_unit)}
                </span>
              ) : null}
              {meta.reward_pending ? (
                <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">
                  · {fmtReward(meta.reward_pending, meta.reward_unit)} pending
                </span>
              ) : null}
            </span>
          </span>
        ) : null}
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {cluster.map((h) => (
                  <ProgrammeCard key={`${h.account}|${h.currency}`} holding={h} names={names} />
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
function ProgrammeCard({ holding, names }: { holding: Holding; names: Names }) {
  const { name } = displayName(holding.account, names)
  const fmtPts = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  const ticker = currencyRedundant(name, holding.currency) ? 'pts' : holding.currency
  return (
    <Link
      href={`/vault/account?account=${encodeURIComponent(holding.account)}&ccy=${encodeURIComponent(holding.currency)}`}
      className={CARD_FRAME}
    >
      <div className="flex items-center gap-2.5">
        <Monogram name={name} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{name}</span>
        <ArrowUpRight
          className="size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground"
          aria-hidden
        />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-xl font-semibold leading-none tracking-tight text-foreground">
          {fmtPts(holding.posted)}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{ticker}</span>
        {holding.pending > 0 ? (
          <span className="ml-auto">
            <StateChip tone="pending">+{fmtPts(holding.pending)}</StateChip>
          </span>
        ) : null}
      </div>
    </Link>
  )
}

