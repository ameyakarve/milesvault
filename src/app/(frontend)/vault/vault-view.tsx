'use client'

import { type ReactNode, useEffect, useState } from 'react'
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
  isHolding,
  isPending,
} from '@/lib/ledger-core/account-display'
import { CenteredState } from '@/components/shared'
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


const fmtAmt = (n: number) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 })

// ── component ─────────────────────────────────────────────────────────────────

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; rows: AccountSummaryRow[] }

// Card-art texture, recreated from scratch from the design's faceted-gradient
// treatments (no assets): a two-tone depth gradient plus angled "facets" — light
// (soft-light), shade, or thin solid (multiply) blades — that give a prismatic
// sheen. Four distinct facet sets, matching the design's card-bg variants, are
// assigned per card for variety. The card must be `relative overflow-hidden`.
type Facet = { points: string; tone: 'light' | 'shade' | 'solid' }
const FACET_VARIANTS: Facet[][] = [
  // parallel diagonals (blue / gray)
  [
    { points: '-3.5,-2.4 33,85.5 99.8,103.6 99.8,-2.4', tone: 'light' },
    { points: '19.4,-2.5 55.9,85.4 122.7,103.4 122.7,-2.5', tone: 'light' },
    { points: '-1.5,-10.2 43,17.5 102.1,104.1 104.8,-10.2', tone: 'shade' },
  ],
  // triangular fan (dk-blue)
  [
    { points: '56.4,-20.9 -12.2,151 105.1,34', tone: 'light' },
    { points: '113.6,-27.2 55.1,49.9 69.1,78.5 99.6,107.4', tone: 'light' },
    { points: '-6.4,-1.9 25.1,114.9 112.5,114.9', tone: 'light' },
    { points: '-1.5,6.3 104.8,104.1 104.8,6.3', tone: 'shade' },
  ],
  // thin solid stripes (purple)
  [
    { points: '-4.1,-7.2 107,101.4 107,-2.5', tone: 'light' },
    { points: '24.7,-14.5 128.9,116.2 128.9,-9', tone: 'solid' },
    { points: '39.1,-14.5 143.3,116.2 143.3,-9', tone: 'solid' },
    { points: '59.4,-14.5 163.6,116.2 163.6,-9', tone: 'solid' },
  ],
  // layered overlap (red)
  [
    { points: '-8,-5.1 13.8,73.7 78.5,114.2 86.3,-5.1', tone: 'light' },
    { points: '5.8,-3.4 26.4,47.6 95.1,107.9 88.6,-21.4', tone: 'light' },
    { points: '-10.7,48.2 14.1,66 83.8,121.7 95.4,-9.9', tone: 'light' },
  ],
]
function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
function CardTexture({ seed }: { seed: string }) {
  const h = hashSeed(seed)
  const facets = FACET_VARIANTS[h % FACET_VARIANTS.length]!
  const lid = `fl${h}`
  const sid = `fs${h}`
  return (
    <>
      <span
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/25"
        aria-hidden
      />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id={lid} x1="100" y1="71" x2="23" y2="5" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity="0.7" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={sid} x1="100" y1="71" x2="23" y2="5" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#000" stopOpacity="0.5" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </linearGradient>
        </defs>
        {facets.map((f, i) => (
          <polygon
            key={i}
            points={f.points}
            fill={f.tone === 'light' ? `url(#${lid})` : f.tone === 'shade' ? `url(#${sid})` : '#000'}
            fillOpacity={f.tone === 'solid' ? 0.12 : undefined}
            style={{ mixBlendMode: f.tone === 'solid' ? 'multiply' : 'soft-light' }}
          />
        ))}
      </svg>
    </>
  )
}

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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
  // Programme commodity → its tier-qualifying status-counter commodities
  // (QUALIFIES_TOWARD, from the KG), so a programme's counters attach by
  // commodity even when ledger account leaves differ. Loaded non-blocking.
  const [statusLinks, setStatusLinks] = useState<Record<string, string[]>>({})
  // Programme commodity → real category (airline/hotel/aggregator) from the KG,
  // for the tile icon. Loaded non-blocking; falls back to the Miles/Points
  // subtree until it arrives.
  const [programmeKinds, setProgrammeKinds] = useState<
    Record<string, 'airline' | 'hotel' | 'aggregator'>
  >({})
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
      fetch('/api/concierge/status-links', noStore)
        .then((r) => (r.ok ? (r.json() as Promise<{ links?: Record<string, string[]> }>) : null))
        .then((d) => alive && d?.links && setStatusLinks(d.links))
        .catch(() => {})
      fetch('/api/concierge/programme-kinds', noStore)
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{ kinds?: Record<string, 'airline' | 'hotel' | 'aggregator'> }>)
            : null,
        )
        .then((d) => alive && d?.kinds && setProgrammeKinds(d.kinds))
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

  // ── hierarchy: rewards are the product (one Programmes section, airline +
  // hotel together), credit cards second. :Pending children fold into their
  // programme. Programme holdings = airline (Miles) + hotel/other (Points);
  // issuer-direct card reward pools live on the card tiles, and status counters
  // (Assets:Rewards:Status:*) are overlaid on the programme tiles.
  const isProgrammeHolding = (a: string) =>
    a.startsWith('Assets:Rewards:Miles:') || a.startsWith('Assets:Rewards:Points:')
  const rewardRows = rows.filter((r) => isProgrammeHolding(r.account))
  const holdings = foldPending(rewardRows)
  // Tier-qualifying status counters (Assets:Rewards:Status:*) — a programme can
  // hold several (nights, segments, qualifying points). They're overlaid on the
  // programme tiles (and excluded from "everything else" below). A counter
  // attaches to a programme tile if EITHER its account leaf matches the
  // programme's leaf, OR its commodity QUALIFIES_TOWARD the programme's
  // commodity per the KG (statusLinks) — the latter catches counters whose
  // account leaf differs (e.g. AllAccor counters under the AllRewards tile).
  const statusRows = rows
    .filter((r) => r.account.startsWith('Assets:Rewards:Status:'))
    .map((r) => ({
      leaf: r.account.split(':')[3] ?? '',
      commodity: r.currency,
      value: Number(r.balance_scaled) / 10 ** r.scale,
    }))
  const countersFor = (h: Holding): Array<{ value: number; commodity: string }> => {
    const leaf = h.account.split(':')[3] ?? ''
    const linked = new Set(statusLinks[h.currency] ?? [])
    const byCommodity = new Map<string, number>()
    for (const sr of statusRows) {
      if (sr.leaf === leaf || linked.has(sr.commodity)) {
        byCommodity.set(sr.commodity, (byCommodity.get(sr.commodity) ?? 0) + sr.value)
      }
    }
    return [...byCommodity.entries()].map(([commodity, value]) => ({ value, commodity }))
  }
  const cardRows = rows
    .filter((r) => r.account.startsWith('Liabilities:CreditCards:'))
    .sort((a, b) => a.account.localeCompare(b.account))

  return (
    <div className="w-full px-6 py-6 space-y-8">
      {/* ── masthead: at-a-glance totals + review prompt ──────────────────── */}
      {stats ? (
        <Masthead stats={stats} cardRows={cardRows} names={names} pendingCaptures={pendingCaptures} />
      ) : null}

      {/* ── credit cards ──────────────────────────────────────────────────── */}
      {cardRows.length > 0 ? (
        <section id="cards" className="scroll-mt-6 space-y-3">
          <SectionHead
            title="Credit cards"
            count={cardRows.length}
            action={<AddButton label="Card" onClick={() => setAddCardOpen(true)} />}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
        countersFor={countersFor}
        programmeKinds={programmeKinds}
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
// Per-card color overrides (keyed `<issuer>:<card>`), checked BEFORE the
// bank-level color — for cards whose plastic differs from the bank palette.
const CARD_BG: Record<string, string> = {
  'hsbc:premier': 'bg-neutral-900', // black
  'hsbc:liveplus': 'bg-zinc-600', // grey
}
function cardBg(account: string): string {
  // Liabilities:CreditCards:<Issuer>:<Card>[:last4]
  const parts = account.split(':')
  const issuer = (parts[2] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const card = (parts[3] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const override = CARD_BG[`${issuer}:${card}`]
  if (override) return override
  if (issuer && BANK_BG[issuer]) return BANK_BG[issuer]!
  let h = 0
  for (let i = 0; i < issuer.length; i++) h = (h * 31 + issuer.charCodeAt(i)) | 0
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
        'group relative flex aspect-[1.6] flex-col justify-between gap-2 overflow-hidden rounded-xl p-4 text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-lg',
        cardBg(row.account),
      )}
    >
      <CardTexture seed={row.account} />
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

// Page masthead: two rich summary modules — Outstanding (what you owe, broken
// down by card) and Spend (this month, by category). Both are MULTI-CURRENCY:
// the totals are per-currency arrays, so each leads with the largest currency
// and lists the rest, and any bar is drawn within a single currency (no FX to
// sum across). The review prompt rides above as an on-brand accent.
function Masthead({
  stats,
  cardRows,
  names,
  pendingCaptures,
}: {
  stats: VaultStats
  cardRows: AccountSummaryRow[]
  names: Names
  pendingCaptures: number
}) {
  return (
    <div className="space-y-3">
      {pendingCaptures > 0 ? (
        <Link
          href="/inbox"
          className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm shadow-sm transition-colors hover:bg-muted/40"
        >
          <span className="size-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
          <span className="text-foreground">
            {pendingCaptures} item{pendingCaptures === 1 ? '' : 's'} ready to review
          </span>
          <span className="ml-auto font-medium text-amber-600 dark:text-amber-400">Open Inbox →</span>
        </Link>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <OutstandingCard stats={stats} cardRows={cardRows} names={names} />
        <SpendCard stats={stats} />
      </div>
    </div>
  )
}

// "+ ₹X · $Y" tail for the non-dominant currencies.
function SecondaryCurrencies({ items }: { items: Array<{ currency: string; amount: number }> }) {
  if (!items.length) return null
  return (
    <span className="font-mono text-xs text-muted-foreground">
      + {items.map((i) => `${fmtAmt(Math.abs(i.amount))} ${i.currency}`).join(' · ')}
    </span>
  )
}

function MiniBreakdown({ rows }: { rows: Array<{ label: string; weight: number; note: string }> }) {
  const total = rows.reduce((s, r) => s + r.weight, 0) || 1
  return (
    <div className="mt-auto pt-4">
      <div className="flex h-2 gap-0.5 overflow-hidden">
        {rows.map((r, i) => (
          <span
            key={r.label + i}
            className={cn('h-full first:rounded-l-full last:rounded-r-full', SPEND_TINTS[i % SPEND_TINTS.length])}
            style={{ width: `${(r.weight / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {rows.slice(0, 3).map((r, i) => (
          <span key={r.label + i} className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn('size-2 shrink-0 rounded-full', SPEND_TINTS[i % SPEND_TINTS.length])}
              aria-hidden
            />
            <span className="truncate text-muted-foreground">{r.label}</span>
            <span className="font-mono text-foreground">{r.note}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function OutstandingCard({
  stats,
  cardRows,
  names,
}: {
  stats: VaultStats
  cardRows: AccountSummaryRow[]
  names: Names
}) {
  // Owed per currency (amount owed = flipped liability sign), largest first.
  const owed = stats.card_outstanding
    .map((o) => ({ currency: o.currency, amount: -o.total }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  const dom = owed[0]
  const secondary = owed.slice(1).filter((o) => Math.abs(o.amount) > 0.005)
  // Which cards carry the dominant-currency balance.
  const byCard = cardRows
    .filter((r) => r.currency === dom?.currency)
    .map((r) => ({ name: displayName(r.account, names).name, amount: -balanceOf(r) }))
    .filter((c) => c.amount > 0.005)
    .sort((a, b) => b.amount - a.amount)
  const inCredit = dom != null && dom.amount < 0 && secondary.length === 0 && byCard.length === 0
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {inCredit ? 'In credit' : 'Outstanding'}
        </span>
        <a href="#cards" className="text-xs font-medium text-muted-foreground hover:text-foreground">
          View cards →
        </a>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span
          className={cn(
            'font-mono text-3xl font-semibold tracking-tight',
            inCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
          )}
        >
          {dom ? fmtAmt(Math.abs(dom.amount)) : '—'}
        </span>
        {dom ? <span className="font-mono text-xs text-muted-foreground">{dom.currency}</span> : null}
        <SecondaryCurrencies items={secondary} />
      </div>
      {byCard.length ? (
        <MiniBreakdown
          rows={byCard.map((c) => ({ label: c.name, weight: c.amount, note: fmtAmt(c.amount) }))}
        />
      ) : null}
    </div>
  )
}

function SpendCard({ stats }: { stats: VaultStats }) {
  const spent = [...stats.expense_total].sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
  const dom = spent[0]
  const secondary = spent
    .slice(1)
    .filter((s) => Math.abs(s.total) > 0.005)
    .map((s) => ({ currency: s.currency, amount: s.total }))
  const cats = dom
    ? stats.expense_categories
        .filter((c) => c.currency === dom.currency)
        .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
        .slice(0, 6)
    : []
  const totalDom = Math.abs(dom?.total ?? 0) || 1
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Spent · this month
        </span>
        <a href="#spending" className="text-xs font-medium text-muted-foreground hover:text-foreground">
          Breakdown →
        </a>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="font-mono text-3xl font-semibold tracking-tight text-foreground">
          {dom ? fmtAmt(dom.total) : '0'}
        </span>
        {dom ? <span className="font-mono text-xs text-muted-foreground">{dom.currency}</span> : null}
        <SecondaryCurrencies items={secondary} />
      </div>
      {cats.length ? (
        <MiniBreakdown
          rows={cats.map((c) => ({
            label: c.category,
            weight: Math.abs(c.total),
            note: `${Math.round((Math.abs(c.total) / totalDom) * 100)}%`,
          }))}
        />
      ) : null}
    </div>
  )
}

// Consistent, present-enough section header (title + optional count + action),
// shared across Credit cards / Programmes / Spending.
function SectionHead({
  title,
  count,
  action,
}: {
  title: string
  count?: number
  action?: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-base font-semibold tracking-tight text-foreground">
        {title}
        {count != null ? (
          <span className="ml-2 text-sm font-normal text-muted-foreground">{count}</span>
        ) : null}
      </h2>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
    >
      + {label}
    </button>
  )
}

// Month-to-date expenses by category, horizontal bars, each row drilling
// into that category's own overview page.
const SPEND_TINTS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-teal-500',
]
function SpendingBreakdown({ stats }: { stats: VaultStats }) {
  const main = stats.expense_total[0]
  if (!main) return null
  const cats = stats.expense_categories.filter((c) => c.currency === main.currency).slice(0, 8)
  const total = Math.abs(main.total) || 1
  const max = Math.max(...cats.map((c) => Math.abs(c.total)), 1)
  const top = cats[0]
  return (
    <section id="spending" className="scroll-mt-6 space-y-3">
      <SectionHead
        title="Spending this month"
        count={cats.length}
        action={<span className="font-mono text-xs text-muted-foreground">month to date</span>}
      />
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        {/* headline: total + the biggest category */}
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border/60 pb-4">
          <span className="flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-semibold tracking-tight text-foreground">
              {fmtAmt(main.total)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{main.currency}</span>
          </span>
          {top ? (
            <span className="text-xs text-muted-foreground">
              Top: <span className="text-foreground">{top.category}</span>{' '}
              ({Math.round((Math.abs(top.total) / total) * 100)}%)
            </span>
          ) : null}
        </div>
        <div className="space-y-3.5">
          {cats.map((c, i) => {
            const pct = Math.round((Math.abs(c.total) / total) * 100)
            const tint = SPEND_TINTS[i % SPEND_TINTS.length]!
            return (
              <Link
                key={c.category}
                href={`/vault/account?account=${encodeURIComponent(`Expenses:${c.category}`)}&ccy=${encodeURIComponent(c.currency)}`}
                className="group block space-y-1.5"
              >
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn('size-2 shrink-0 rounded-full', tint)} aria-hidden />
                    <span className="truncate text-foreground group-hover:underline group-hover:underline-offset-4">
                      {c.category}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="font-mono text-foreground">
                      {fmtAmt(c.total)} {c.currency}
                    </span>
                    <span className="w-9 text-right font-mono text-[11px] text-muted-foreground">
                      {pct}%
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full transition-all', tint)}
                    style={{ width: `${Math.max(2, (Math.abs(c.total) / max) * 100)}%` }}
                  />
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// Structural clusters straight off the account paths (the taxonomy's
// minting-source subtrees) — no KG round-trip needed.
const PROGRAMME_EMPTY_SEED =
  'I want to track a loyalty programme — an airline frequent-flyer or a hotel programme. Ask me which one and how many points/miles I hold, then open the right Assets:Rewards account with the ticker and record the balance.'

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

// All loyalty programmes — airline (Miles) and hotel/other (Points) — in one
// section. The plane/hotel mark on each tile distinguishes the kind.
function RewardsSections({
  holdings,
  names,
  countersFor,
  programmeKinds,
  onAdd,
}: {
  holdings: Holding[]
  names: Names
  countersFor: (h: Holding) => Array<{ value: number; commodity: string }>
  programmeKinds: Record<string, 'airline' | 'hotel' | 'aggregator'>
  onAdd: () => void
}) {
  return (
    <section className="space-y-3">
      <SectionHead
        title="Programmes"
        count={holdings.length}
        action={<AddButton label="Programme" onClick={onAdd} />}
      />
      {holdings.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {holdings.map((h) => (
            <ProgrammeCard
              key={`${h.account}|${h.currency}`}
              holding={h}
              names={names}
              status={countersFor(h)}
              category={programmeKinds[h.currency]}
            />
          ))}
        </div>
      ) : (
        <Link
          href={`/editor?prefill=${encodeURIComponent(PROGRAMME_EMPTY_SEED)}`}
          className="flex items-center justify-between rounded-xl border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <span>No programmes yet</span>
          <span className="shrink-0 text-xs">Add in the Ledger chat →</span>
        </Link>
      )}
    </section>
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
  category,
}: {
  holding: Holding
  names: Names
  status?: Array<{ value: number; commodity: string }>
  // Real category from the KG (drives the fallback icon). When absent, derived
  // from the Miles/Points subtree.
  category?: 'airline' | 'hotel' | 'aggregator'
}) {
  const { name } = displayName(holding.account, names)
  const fmtPts = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  const kind: 'miles' | 'points' = holding.account.startsWith('Assets:Rewards:Miles:')
    ? 'miles'
    : 'points'
  const cat: 'airline' | 'hotel' | 'aggregator' =
    category ?? (kind === 'miles' ? 'airline' : 'hotel')
  const unitLabel = kind === 'miles' ? 'Miles' : 'Points'
  const ticker = currencyRedundant(name, holding.currency) ? null : holding.currency
  const counters = status.filter((s) => s.value !== 0)
  return (
    <Link
      href={`/vault/account?account=${encodeURIComponent(holding.account)}&ccy=${encodeURIComponent(holding.currency)}`}
      className={cn(
        'group relative flex aspect-[1.6] flex-col justify-between gap-2 overflow-hidden rounded-xl p-4 text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-lg',
        programmeBg(holding.account),
      )}
    >
      <CardTexture seed={holding.account} />
      <span className="flex items-center gap-2">
        <ProgrammeMark account={holding.account} category={cat} className="size-5 shrink-0" />
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

