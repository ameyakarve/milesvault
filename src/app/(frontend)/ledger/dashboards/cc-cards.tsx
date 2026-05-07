'use client'

import { Group, Stack, Text, Tooltip } from '@mantine/core'
import { Sparkline } from '@mantine/charts'
import type { CompositionRow, EventRow, TreemapNode, TrendPoint } from '../overview-view'
import { CardEyebrow, DashCard, HeroValue } from './cards'
import { CURRENCY_SYMBOL, TREEMAP_PALETTE, compactAmount, formatAmount } from './format'

// Statement summary: hero card. Period spend is the headline number; the
// sparkline shows the monthly trend; balance owed is the secondary line.
// Replaces 3 stat tiles + the standalone monthly-spend line chart.
export function StatementSummaryCard({
  balance,
  monthlyNet,
}: {
  balance: string
  monthlyNet?: { points: TrendPoint[]; totalLabel: string; currency: string }
}) {
  const sparkData = monthlyNet?.points.map((p) => p.y) ?? []
  const sparkPoints = monthlyNet?.points ?? []
  const hasTotal = !!monthlyNet?.totalLabel
  const hero = hasTotal ? monthlyNet!.totalLabel : balance
  // Strip leading minus on the secondary so "owed now" doesn't read as a
  // double-negative ("−₹1,24,800.00 owed now").
  const balanceForSub = balance.startsWith('−') ? balance.slice(1) : balance
  return (
    <DashCard title={hasTotal ? 'Total spend' : 'Owed now'}>
      <Stack gap="md">
        <HeroValue>{hero}</HeroValue>
        {sparkData.length > 1 && (
          <Stack gap={2}>
            <Sparkline
              data={sparkData}
              h={60}
              curveType="monotone"
              color="#e11d48"
              fillOpacity={0.18}
              strokeWidth={2}
            />
            <Group justify="space-between" gap={0}>
              <Text size="10px" ff="monospace" c="dimmed">
                {sparkPoints[0]!.label}
              </Text>
              <Text size="10px" ff="monospace" c="dimmed">
                {sparkPoints[sparkPoints.length - 1]!.label}
              </Text>
            </Group>
          </Stack>
        )}
        {hasTotal && (
          <Group gap={6} wrap="nowrap">
            <Text size="xs" fw={700} ff="monospace" c="dark.6">
              {balanceForSub}
            </Text>
            <Text size="xs" c="dimmed">
              owed now
            </Text>
          </Group>
        )}
      </Stack>
    </DashCard>
  )
}

// Three-column stacked bars: Sources -> Cards -> Categories. Replaces the
// two donuts (cards used + paid from) and the Sankey by saying the same
// thing in one tighter card. Cards column collapses when only one card.
export function MoneyFlowCard({
  paidFrom,
  cardsUsed,
  categoryTreemap,
  currency = 'INR',
}: {
  paidFrom?: { rows: CompositionRow[] }
  cardsUsed?: { rows: CompositionRow[] }
  categoryTreemap?: TreemapNode
  currency?: string
}) {
  const sourcesSegs = (paidFrom?.rows ?? []).map((r, i) => ({
    label: r.leaf,
    value: r.value ?? 0,
    color: TREEMAP_PALETTE[i % TREEMAP_PALETTE.length]!,
  }))
  const cardsSegs = (cardsUsed?.rows ?? []).map((r, i) => ({
    label: r.leaf,
    value: r.value ?? 0,
    color: TREEMAP_PALETTE[i % TREEMAP_PALETTE.length]!,
  }))
  const catSegs = (categoryTreemap?.children ?? [])
    .map((c, i) => {
      const total = (c.children ?? []).reduce((s, leaf) => s + (leaf.value ?? 0), 0)
      return {
        label: c.name,
        value: total,
        color: TREEMAP_PALETTE[i % TREEMAP_PALETTE.length]!,
      }
    })
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)

  const columns: { title: string; segs: typeof sourcesSegs }[] = []
  if (sourcesSegs.length > 0) columns.push({ title: 'Funded from', segs: sourcesSegs })
  if (cardsSegs.length > 1) columns.push({ title: 'Cards', segs: cardsSegs })
  if (catSegs.length > 0) columns.push({ title: 'Spent on', segs: catSegs })
  if (columns.length < 2) return null

  return (
    <DashCard title="Money flow">
      <Group align="stretch" gap="lg" wrap="nowrap" style={{ minHeight: 360 }}>
        {columns.map((col) => (
          <StackColumn
            key={col.title}
            title={col.title}
            segments={col.segs}
            currency={currency}
          />
        ))}
      </Group>
    </DashCard>
  )
}

function StackColumn({
  title,
  segments,
  currency,
}: {
  title: string
  segments: { label: string; value: number; color: string }[]
  currency: string
}) {
  const sum = segments.reduce((s, x) => s + x.value, 0) || 1
  const symbol = CURRENCY_SYMBOL[currency] ?? ''
  return (
    <Stack gap={8} className="flex-1 min-w-0">
      <CardEyebrow>{title}</CardEyebrow>
      <div className="flex flex-col rounded-md overflow-hidden flex-1 gap-[2px]">
        {segments.map((seg) => {
          const pct = (seg.value / sum) * 100
          const compact = `${symbol}${compactAmount(seg.value, currency)}`
          const full = formatAmount(seg.value, currency)
          return (
            <Tooltip
              key={seg.label}
              label={
                <span>
                  <strong>{seg.label}</strong> · {full} · {pct.toFixed(1)}%
                </span>
              }
              withArrow
              openDelay={200}
              position="right"
            >
              <div
                className="flex flex-col justify-center px-3 py-1 text-[11px] text-white overflow-hidden cursor-default transition-opacity hover:opacity-90"
                style={{ background: seg.color, height: `${pct}%`, minHeight: 32 }}
              >
                <span className="truncate font-medium leading-tight">{seg.label}</span>
                <span className="truncate font-mono text-[10px] opacity-90 leading-tight">
                  {compact}
                </span>
              </div>
            </Tooltip>
          )
        })}
      </div>
    </Stack>
  )
}

function formatCompact(value: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? ''
  return `${symbol}${compactAmount(value, currency)}`
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  const monthIdx = Math.max(0, Math.min(11, parseInt(m!, 10) - 1))
  return `${SHORT_MONTHS[monthIdx]} ${parseInt(d!, 10)}`
}

// Top merchants by spend across the period. Excludes payments/refunds —
// just "where did money go". Bar shows share-of-leader, not share-of-total,
// so the #1 row always fills the bar.
export function TopMerchantsCard({
  topMerchants,
}: {
  topMerchants?: {
    currency: string
    rows: { payee: string; amount: number; share: number; count: number }[]
  }
}) {
  if (!topMerchants || topMerchants.rows.length === 0) return null
  const { currency, rows } = topMerchants
  return (
    <DashCard title="Top merchants">
      <Stack gap={10}>
        {rows.map((r) => (
          <Tooltip
            key={r.payee}
            label={
              <span>
                <strong>{r.payee}</strong> · {formatAmount(r.amount, currency)} · {r.count} txn
                {r.count === 1 ? '' : 's'}
              </span>
            }
            withArrow
            openDelay={200}
            position="right"
          >
            <div className="flex items-center gap-3 text-[12px] cursor-default">
              <div className="w-[140px] shrink-0 truncate font-medium text-slate-900">
                {r.payee}
              </div>
              <div className="flex-1 h-[6px] bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(r.share * 100, 4)}%`,
                    background: 'linear-gradient(90deg, #0f766e 0%, #14b8a6 100%)',
                  }}
                />
              </div>
              <div className="w-[64px] shrink-0 text-right font-mono tabular-nums text-slate-700">
                {formatCompact(r.amount, currency)}
              </div>
              <div className="w-[32px] shrink-0 text-right font-mono text-[10px] text-slate-400">
                ×{r.count}
              </div>
            </div>
          </Tooltip>
        ))}
      </Stack>
    </DashCard>
  )
}

// Activity: 30-day daily-intensity sparkline pinned to the top of the
// recent-charges list. Combines what used to be Spend Calendar's "rough
// pulse" with a charges-only event log so there's one card for "what did
// I just spend on lately."
export function ActivityCard({
  recentCharges,
  spendCalendar,
  currency = 'INR',
}: {
  recentCharges?: { rows: EventRow[] }
  spendCalendar?: { days: { date: string; amount: number }[] }
  currency?: string
}) {
  const rows = recentCharges?.rows ?? []
  const last30Days = (spendCalendar?.days ?? []).slice(-30)
  const last30 = last30Days.map((d) => d.amount)
  const last30Total = last30.reduce((s, n) => s + n, 0)
  const showSpark = last30.length >= 7 && last30Total > 0
  return (
    <DashCard
      title="Recent charges"
      right={showSpark ? <CardEyebrow>Last 30 days</CardEyebrow> : undefined}
    >
      {showSpark && (
        <Stack gap={2} mb="sm">
          <Sparkline
            data={last30}
            h={36}
            curveType="linear"
            color="#0f766e"
            fillOpacity={0.22}
            strokeWidth={1.5}
          />
          <Group justify="space-between" gap={0}>
            <Text size="10px" ff="monospace" c="dimmed">
              {formatShortDate(last30Days[0]!.date)}
            </Text>
            <Text size="10px" ff="monospace" c="dimmed">
              {formatShortDate(last30Days[last30Days.length - 1]!.date)}
            </Text>
          </Group>
        </Stack>
      )}
      {rows.length === 0 ? (
        <Text size="xs" c="dimmed" py="xs">
          No charges in this period
        </Text>
      ) : (
        <div>
          {rows.map((row, i) => {
            const display =
              row.amountValue != null
                ? `${CURRENCY_SYMBOL[currency] ?? ''}${compactAmount(row.amountValue, currency)}`
                : row.amount.startsWith('+')
                  ? row.amount.slice(1)
                  : row.amount
            return (
              <div
                key={i}
                className={`h-[44px] flex items-center px-2 text-[12px] gap-3 ${
                  i === 0 ? 'bg-slate-50/70 rounded' : ''
                } ${i < rows.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <div className="w-[80px] shrink-0 font-mono text-[11px] text-slate-500">
                  {row.date}
                </div>
                <div
                  className={`shrink-0 truncate min-w-0 max-w-[160px] ${
                    i === 0 ? 'font-semibold text-slate-900' : 'font-medium text-slate-900'
                  }`}
                >
                  {row.payee}
                </div>
                <div className="flex-1 text-slate-600 truncate min-w-0">{row.narration}</div>
                <Tooltip label={row.amount} withArrow openDelay={300}>
                  <div
                    className={`shrink-0 text-right font-mono tabular-nums ${row.amountClass}`}
                  >
                    {display}
                  </div>
                </Tooltip>
              </div>
            )
          })}
        </div>
      )}
    </DashCard>
  )
}
