'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { AccountOverview } from '@/durable/ledger-do'
import { accountLabel, displayName as resolveName, prettyLeaf } from '@/lib/ledger-core/account-display'
import { SectionLabel, StatTile, CenteredState, Monogram } from '@/components/shared'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ── types ─────────────────────────────────────────────────────────────────────

type Range = '1m' | '3m' | 'ytd' | '12m' | 'all'

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: AccountOverview }

// ── helpers ───────────────────────────────────────────────────────────────────

function intToYmd(d: number): string {
  const s = String(d)
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: decimals })
}

/** YYYYMMDD → "MMM YY" e.g. 20240315 → "Mar 24" */
function fmtDateShort(d: number): string {
  const s = String(d)
  const year = s.slice(0, 4)
  const month = parseInt(s.slice(4, 6), 10) - 1
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${MONTHS[month] ?? '?'} ${year.slice(2)}`
}

const RANGE_LABELS: { key: Range; label: string }[] = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: 'ytd', label: 'YTD' },
  { key: '12m', label: '12M' },
  { key: 'all', label: 'All' },
]

// ── root component ─────────────────────────────────────────────────────────────

export function AccountOverviewView() {
  const [account, setAccount] = useState<string | null>(null)
  const [ccy, setCcy] = useState<string | null>(null)
  const [range, setRange] = useState<Range>('3m')
  const [state, setState] = useState<FetchState>({ status: 'loading' })
  const [names, setNames] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/concierge/account-names')
      .then((r) => (r.ok ? (r.json() as Promise<{ names?: Record<string, string> }>) : null))
      .then((d) => !cancelled && d?.names && setNames(d.names))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  const [ready, setReady] = useState(false)

  // Read params from URL on mount (client-only, like status-match-view.tsx)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setAccount(p.get('account'))
    setCcy(p.get('ccy') ?? null)
    setReady(true)
  }, [])

  // Fetch overview whenever account / ccy / range changes
  useEffect(() => {
    if (!ready || !account) return
    let cancelled = false
    setState({ status: 'loading' })
    const q = new URLSearchParams({ account, range })
    if (ccy) q.set('ccy', ccy)
    fetch(`/api/ledger/account-overview?${q.toString()}`)
      .then((r) =>
        r.ok
          ? (r.json() as Promise<AccountOverview>)
          : Promise.reject(new Error(`${r.status}`)),
      )
      .then((d) => {
        if (!cancelled) setState({ status: 'ok', data: d })
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [ready, account, ccy, range])

  if (!ready || (state.status === 'loading' && !account)) {
    return <CenteredState>Loading…</CenteredState>
  }

  if (!account) {
    return <CenteredState>No account specified.</CenteredState>
  }

  // Header (shown during load/error/ok)
  const currencies = state.status === 'ok' ? state.data.currencies : (ccy ? [ccy] : [])
  const activeCcy = state.status === 'ok' ? (state.data.currency ?? ccy) : ccy

  const { name: displayName, suffix } = resolveName(account, names)

  // Kind-aware language (overview-tab.md per-kind fill): a credit card owes
  // and spends; a points programme earns and redeems.
  const isCard = account.startsWith('Liabilities:CreditCards:')
  const isPoints = account.startsWith('Assets:Rewards:Points:')
  const kpiLabels = isCard
    ? { bal: 'Owed', inflow: 'Payments', outflow: 'Spend' }
    : isPoints
      ? { bal: 'Balance', inflow: 'Earned', outflow: 'Redeemed' }
      : { bal: 'Balance', inflow: 'In', outflow: 'Out' }

  // KG linkage: the rewards programme this card earns into (credit cards only).
  type CardLink = {
    card: string
    rewards_account: string | null
    rewards_name: string | null
    rewards_currency: string | null
    rewards_balance: number | null
  }
  const [cardLink, setCardLink] = useState<CardLink | null>(null)
  useEffect(() => {
    if (!isCard) return
    let cancelled = false
    fetch('/api/concierge/card-links')
      .then((r) => (r.ok ? (r.json() as Promise<{ links?: CardLink[] }>) : null))
      .then((d) => {
        if (cancelled || !d) return
        setCardLink(d.links?.find((l) => l.card === account) ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [account, isCard])

  const header = (
    <div className="flex flex-col gap-2 border-b border-border bg-background px-6 py-4">
      <Link
        href="/vault"
        className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Vault
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Monogram name={displayName} size="lg" className="mt-0.5" />
          <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-base font-semibold text-foreground truncate">
            {displayName}
            {suffix ? (
              <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
                ··{suffix}
              </span>
            ) : null}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground break-all">{account}</span>
          <Link
            href={`/editor?tab=journal&account=${encodeURIComponent(account)}`}
            className="text-xs text-foreground underline underline-offset-4 hover:no-underline"
          >
            Open in Journal →
          </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Currency chips — only shown when >1 currency */}
          {currencies.length > 1 && currencies.map((c) => (
            <Button
              key={c}
              type="button"
              onClick={() => setCcy(c)}
              variant={c === activeCcy ? 'default' : 'outline'}
              size="xs"
              className="font-mono"
            >
              {c}
            </Button>
          ))}
          {/* Time-range chips — right side, above slot A per contract rule 5 */}
          <div className="flex items-center gap-0.5 rounded-full bg-muted p-0.5">
            {RANGE_LABELS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={[
                  'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition',
                  range === key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  if (state.status === 'loading') {
    return (
      <>
        {header}
        <CenteredState>Loading…</CenteredState>
      </>
    )
  }

  if (state.status === 'error') {
    return (
      <>
        {header}
        <CenteredState tone="error">Failed to load: {state.message}</CenteredState>
      </>
    )
  }

  const { data } = state

  return (
    <>
      {header}
      <div className="px-6 py-6 max-w-4xl mx-auto w-full space-y-4">
        {/* ── A: KPI strip ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile
            label={kpiLabels.bal}
            value={fmt(data.current)}
            sub={data.currency ?? undefined}
            negative={data.current < 0}
          />
          <StatTile
            label={kpiLabels.inflow}
            value={fmt(data.inflow)}
            sub={data.currency ?? undefined}
          />
          <StatTile
            label={kpiLabels.outflow}
            value={fmt(data.outflow)}
            sub={data.currency ?? undefined}
          />
          <StatTile
            label="Transactions"
            value={String(data.txn_count)}
          />
        </div>

        {/* ── Earns: KG-linked rewards programme (credit cards) ─────────────── */}
        {isCard && cardLink?.rewards_name ? (
          cardLink.rewards_account ? (
            <Link
              href={`/vault/account?account=${encodeURIComponent(cardLink.rewards_account)}${cardLink.rewards_currency ? `&ccy=${encodeURIComponent(cardLink.rewards_currency)}` : ''}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-foreground/25"
            >
              <Monogram name={cardLink.rewards_name} />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                Earns <span className="font-medium">{cardLink.rewards_name}</span>
              </span>
              {cardLink.rewards_balance != null ? (
                <span className="shrink-0 font-mono text-lg font-semibold text-foreground">
                  {cardLink.rewards_balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">pts</span>
                </span>
              ) : null}
              <span className="shrink-0 text-xs text-muted-foreground">View rewards →</span>
            </Link>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3">
              <Monogram name={cardLink.rewards_name} />
              <span className="text-sm text-muted-foreground">
                Earns <span className="font-medium text-foreground">{cardLink.rewards_name}</span> — no
                rewards account in your ledger yet
              </span>
            </div>
          )
        ) : null}

        {/* ── B+C row ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row gap-4">
          {/* B — Trend chart (2/3 width on desktop) */}
          <div className="md:w-2/3">
            <SlotCard label="Trend">
              {data.series.length < 2 ? (
                <EmptySlot />
              ) : (
                <TrendChart series={data.series} monthly={data.monthly} />
              )}
            </SlotCard>
          </div>

          {/* C — Composition (1/3 width on desktop) */}
          <div className="md:w-1/3">
            <SlotCard label="Composition">
              {data.composition.length === 0 ? (
                <EmptySlot />
              ) : (
                <CompositionBars composition={data.composition} currency={data.currency ?? undefined} />
              )}
            </SlotCard>
          </div>
        </div>

        {/* ── D — Notable events ───────────────────────────────────────────── */}
        <SlotCard label="Notable">
          {data.notable.length === 0 ? (
            <EmptySlot />
          ) : (
            <NotableList
              notable={data.notable}
              currency={data.currency ?? undefined}
              account={account}
            />
          )}
        </SlotCard>
      </div>
    </>
  )
}

// ── Slot card wrapper ─────────────────────────────────────────────────────────

function SlotCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2 h-full">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  )
}

// ── Empty slot ────────────────────────────────────────────────────────────────

function EmptySlot() {
  return (
    <div className="flex flex-1 items-center justify-center py-8 text-[12px] text-muted-foreground">
      Not enough data yet
    </div>
  )
}

// ── B: Trend chart (inline SVG, no deps) ─────────────────────────────────────
//
// Layout: the SVG uses a fixed viewBox (600 × 200). The balance line occupies
// the top ~68% of the height (0..136 px in viewBox units). Monthly net bars
// are rendered in the bottom strip (136..200) as small bars centred on their
// month's midpoint date. A subtle area fill goes under the line. Only
// min/max/current labels and first/last date labels are shown — no axes grid.

const VB_W = 600
const VB_H = 200
const LINE_AREA_TOP = 8      // top padding
const LINE_AREA_BOT = 140    // bottom of the line zone (before bar zone)
const BAR_TOP = 148          // top of the bar strip
const BAR_BOT = 192          // bottom of the bar strip
const MONO_FONT = '"JetBrains Mono", monospace'

function TrendChart({
  series,
  monthly,
}: {
  series: Array<{ date: number; balance: number }>
  monthly: Array<{ month: number; net: number }>
}) {
  if (series.length < 2) return <EmptySlot />

  const minDate = series[0]!.date
  const maxDate = series[series.length - 1]!.date
  const dateRange = maxDate - minDate || 1  // avoid div/0 if single point

  // Balance extents
  const balances = series.map((p) => p.balance)
  const minBal = Math.min(...balances)
  const maxBal = Math.max(...balances)
  const balRange = maxBal - minBal || 1

  // Map a date integer (YYYYMMDD) to an x coordinate.
  // We treat the integer difference linearly — good enough for the chart.
  function xOf(date: number): number {
    return ((date - minDate) / dateRange) * VB_W
  }

  // Map a balance value to a y coordinate (flipped: higher = lower y).
  function yOf(bal: number): number {
    return LINE_AREA_BOT - LINE_AREA_TOP - ((bal - minBal) / balRange) * (LINE_AREA_BOT - LINE_AREA_TOP - 4) + LINE_AREA_TOP
  }

  // Build the SVG path string for the balance line.
  const points = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.date).toFixed(1)},${yOf(p.balance).toFixed(1)}`).join(' ')

  // Area fill: close down to the bottom of the line area.
  const area =
    points +
    ` L${xOf(maxDate).toFixed(1)},${LINE_AREA_BOT} L${xOf(minDate).toFixed(1)},${LINE_AREA_BOT} Z`

  // Monthly net bars — only when we have ≥ 2 months of data
  const showBars = monthly.length > 1
  let maxAbsNet = 0
  if (showBars) {
    for (const m of monthly) {
      if (Math.abs(m.net) > maxAbsNet) maxAbsNet = Math.abs(m.net)
    }
  }
  const barHeight = BAR_BOT - BAR_TOP

  // Labels
  const currentBal = series[series.length - 1]!.balance
  const minBalPt = series.reduce((a, b) => (b.balance < a.balance ? b : a))
  const maxBalPt = series.reduce((a, b) => (b.balance > a.balance ? b : a))

  return (
    // text-foreground drives currentColor for line + area
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="w-full text-foreground"
      aria-label="Balance trend chart"
      style={{ fontFamily: MONO_FONT }}
    >
      {/* Area fill — currentColor at low opacity */}
      <path d={area} fill="currentColor" opacity="0.08" />

      {/* Balance line — currentColor */}
      <path d={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* Monthly net bars */}
      {showBars && monthly.map((m) => {
        // Place bar at month's approximate midpoint x using YYYYMM → midpoint date
        const yr = Math.floor(m.month / 100)
        const mo = m.month % 100
        const midDay = yr * 10000 + mo * 100 + 15
        const bx = xOf(midDay)
        const barW = Math.max(4, (VB_W / monthly.length) * 0.55)
        const h = maxAbsNet > 0 ? (Math.abs(m.net) / maxAbsNet) * barHeight : 0
        const positive = m.net >= 0
        return (
          <rect
            key={m.month}
            x={(bx - barW / 2).toFixed(1)}
            y={positive ? (BAR_BOT - h).toFixed(1) : String(BAR_TOP)}
            width={barW.toFixed(1)}
            height={h.toFixed(1)}
            fill={positive ? 'currentColor' : 'rgba(225,29,72,0.15)'}
            stroke={positive ? 'currentColor' : '#e11d48'}
            opacity={positive ? 0.15 : 1}
            strokeWidth="0.75"
          />
        )
      })}

      {/* Min label */}
      <text
        x={xOf(minBalPt.date).toFixed(1)}
        y={(yOf(minBalPt.balance) + 12).toFixed(1)}
        fontSize="9"
        fill="var(--muted-foreground)"
        textAnchor="middle"
      >
        {fmt(minBalPt.balance, 0)}
      </text>

      {/* Max label */}
      <text
        x={xOf(maxBalPt.date).toFixed(1)}
        y={(yOf(maxBalPt.balance) - 4).toFixed(1)}
        fontSize="9"
        fill="var(--muted-foreground)"
        textAnchor="middle"
      >
        {fmt(maxBalPt.balance, 0)}
      </text>

      {/* Current label — at the last point, right-aligned, foreground */}
      <text
        x={Math.min(xOf(maxDate) - 2, VB_W - 2).toFixed(1)}
        y={(yOf(currentBal) - 4).toFixed(1)}
        fontSize="9"
        fill="currentColor"
        textAnchor="end"
        fontWeight="600"
      >
        {fmt(currentBal, 0)}
      </text>

      {/* First date label */}
      <text x="0" y={VB_H - 1} fontSize="9" fill="var(--muted-foreground)" textAnchor="start">
        {fmtDateShort(minDate)}
      </text>

      {/* Last date label */}
      <text x={VB_W} y={VB_H - 1} fontSize="9" fill="var(--muted-foreground)" textAnchor="end">
        {fmtDateShort(maxDate)}
      </text>
    </svg>
  )
}

// ── C: Composition horizontal-bar list ────────────────────────────────────────

function CompositionBars({
  composition,
  currency,
}: {
  composition: Array<{ account: string; total: number }>
  currency?: string
}) {
  const maxAbs = Math.max(...composition.map((r) => Math.abs(r.total)), 1)

  return (
    <div className="flex flex-col gap-2">
      {composition.map((row) => {
        const pct = (Math.abs(row.total) / maxAbs) * 100
        const negative = row.total < 0
        return (
          <div key={row.account} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <Link
                href={`/vault/account?account=${encodeURIComponent(row.account)}`}
                className="text-[11px] text-muted-foreground truncate min-w-0 hover:text-foreground underline-offset-4 hover:underline"
                title={row.account}
              >
                {prettyLeaf(accountLabel(row.account).label)}
              </Link>
              <span className={[
                'text-[11px] font-mono shrink-0',
                negative ? 'text-rose-600 dark:text-rose-400' : 'text-foreground',
              ].join(' ')}>
                {negative ? '−' : '+'}{fmt(Math.abs(row.total))}{currency ? ` ${currency}` : ''}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted">
              <div
                className={['h-1.5 rounded-full', negative ? 'bg-rose-400 dark:bg-rose-500' : 'bg-foreground/80'].join(' ')}
                style={{ width: `${pct.toFixed(1)}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── D: Notable list ───────────────────────────────────────────────────────────

function NotableList({
  notable,
  currency,
  account,
}: {
  notable: Array<{ date: number; payee: string; narration: string; amount: number }>
  currency?: string
  account: string
}) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {notable.map((row, i) => {
        const negative = row.amount < 0
        const label = [row.payee, row.narration].filter(Boolean).join(' — ')
        const ymd = intToYmd(row.date)
        return (
          <Link
            key={i}
            href={`/editor?tab=journal&account=${encodeURIComponent(account)}&from=${ymd}&to=${ymd}`}
            className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0 hover:bg-muted rounded px-1 -mx-1"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                {fmtDateShort(row.date)}
              </span>
              <span className="text-[12px] text-foreground truncate" title={label}>
                {label || '—'}
              </span>
            </div>
            <span className={[
              'text-[12px] font-mono shrink-0 whitespace-nowrap',
              negative ? 'text-rose-600 dark:text-rose-400' : 'text-foreground',
            ].join(' ')}>
              {negative ? '−' : '+'}{fmt(Math.abs(row.amount))}{currency ? ` ${currency}` : ''}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
