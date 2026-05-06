'use client'

import { Card, Group, Stack, Text } from '@mantine/core'
import { Sparkline } from '@mantine/charts'
import type { CompositionRow, EventRow, TreemapNode, TrendPoint } from '../overview-view'
import { TREEMAP_PALETTE } from './format'

// Statement summary: hero card. Owed-now + sparkline of monthly spend +
// period total. Replaces 3 stat tiles + the standalone monthly-spend line
// chart.
export function StatementSummaryCard({
  balance,
  monthlyNet,
}: {
  balance: string
  monthlyNet?: { points: TrendPoint[]; totalLabel: string; currency: string }
}) {
  const sparkData = monthlyNet?.points.map((p) => p.y) ?? []
  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="md">
        <Stack gap={4}>
          <Text size="9px" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.1em' }}>
            Owed now
          </Text>
          <Text fw={700} ff="monospace" size="28px" lh={1}>
            {balance}
          </Text>
        </Stack>
        {sparkData.length > 1 && (
          <Sparkline
            data={sparkData}
            h={60}
            curveType="monotone"
            color="#e11d48"
            fillOpacity={0.18}
            strokeWidth={2}
          />
        )}
        {monthlyNet?.totalLabel && (
          <Group gap={6} wrap="nowrap">
            <Text size="xs" fw={700} ff="monospace" c="dark.6">
              {monthlyNet.totalLabel}
            </Text>
            <Text size="xs" c="dimmed">
              spent over period
            </Text>
          </Group>
        )}
      </Stack>
    </Card>
  )
}

// Three-column stacked bars: Sources -> Cards -> Categories. Replaces the
// two donuts (cards used + paid from) and the Sankey by saying the same
// thing in one tighter card. Cards column collapses when only one card.
export function MoneyFlowCard({
  paidFrom,
  cardsUsed,
  categoryTreemap,
}: {
  paidFrom?: { rows: CompositionRow[] }
  cardsUsed?: { rows: CompositionRow[] }
  categoryTreemap?: TreemapNode
}) {
  const sourcesSegs = (paidFrom?.rows ?? []).map((r, i) => ({
    label: r.leaf,
    value: r.value ?? 0,
    amount: r.amount,
    color: TREEMAP_PALETTE[i % TREEMAP_PALETTE.length]!,
  }))
  const cardsSegs = (cardsUsed?.rows ?? []).map((r, i) => ({
    label: r.leaf,
    value: r.value ?? 0,
    amount: r.amount,
    color: TREEMAP_PALETTE[i % TREEMAP_PALETTE.length]!,
  }))
  const catSegs = (categoryTreemap?.children ?? [])
    .map((c, i) => {
      const total = (c.children ?? []).reduce((s, leaf) => s + (leaf.value ?? 0), 0)
      return {
        label: c.name,
        value: total,
        amount: total > 0 ? `₹${total.toLocaleString('en-IN')}` : '',
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
    <Card withBorder radius="md" p="md">
      <Text size="xs" fw={500} c="dark.4" mb="sm">
        Money flow
      </Text>
      <Group align="stretch" gap="md" wrap="nowrap" style={{ minHeight: 280 }}>
        {columns.map((col) => (
          <StackColumn key={col.title} title={col.title} segments={col.segs} />
        ))}
      </Group>
    </Card>
  )
}

function StackColumn({
  title,
  segments,
}: {
  title: string
  segments: { label: string; value: number; amount: string; color: string }[]
}) {
  const sum = segments.reduce((s, x) => s + x.value, 0) || 1
  return (
    <Stack gap={6} className="flex-1 min-w-0">
      <Text size="9px" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.1em' }}>
        {title}
      </Text>
      <div className="flex flex-col rounded overflow-hidden flex-1">
        {segments.map((seg) => {
          const pct = (seg.value / sum) * 100
          return (
            <div
              key={seg.label}
              className="flex flex-col justify-center px-2 text-[10px] text-white overflow-hidden"
              style={{ background: seg.color, height: `${pct}%`, minHeight: 24 }}
              title={`${seg.label} · ${seg.amount}`}
            >
              <span className="truncate font-medium">{seg.label}</span>
              <span className="truncate font-mono opacity-90">{seg.amount}</span>
            </div>
          )
        })}
      </div>
    </Stack>
  )
}

// Activity: 30-day daily-intensity sparkline pinned to the top of the
// recent-charges list. Combines what used to be Spend Calendar's "rough
// pulse" with the event log so there's one card for "what happened lately."
export function ActivityCard({
  events,
  spendCalendar,
}: {
  events: { rows: EventRow[] }
  spendCalendar?: { days: { date: string; amount: number }[] }
}) {
  const last30 = (spendCalendar?.days ?? []).slice(-30).map((d) => d.amount)
  const last30Total = last30.reduce((s, n) => s + n, 0)
  const showSpark = last30.length >= 7 && last30Total > 0
  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between" align="center" mb="sm">
        <Text size="xs" fw={500} c="dark.4">
          Recent charges
        </Text>
        {showSpark && (
          <Text size="9px" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.1em' }}>
            Last 30 days
          </Text>
        )}
      </Group>
      {showSpark && (
        <Sparkline
          data={last30}
          h={36}
          curveType="linear"
          color="#0f766e"
          fillOpacity={0.22}
          strokeWidth={1.5}
          mb="sm"
        />
      )}
      {events.rows.length === 0 ? (
        <Text size="xs" c="dimmed" py="xs">
          No notable charges
        </Text>
      ) : (
        <div>
          {events.rows.map((row, i) => (
            <div
              key={i}
              className={`h-[44px] flex items-center px-2 text-[12px] ${
                i === 0 ? 'bg-slate-50/70 rounded' : ''
              } ${i < events.rows.length - 1 ? 'border-b border-slate-100' : ''}`}
            >
              <div className="w-[96px] shrink-0 font-mono text-[11px] text-slate-500">
                {row.date}
              </div>
              <div
                className={`shrink-0 truncate mr-4 min-w-[120px] max-w-[200px] ${
                  i === 0 ? 'font-semibold text-slate-900' : 'font-medium text-slate-900'
                }`}
              >
                {row.payee}
              </div>
              <div className="flex-1 text-slate-600 truncate">{row.narration}</div>
              <div
                className={`w-[140px] shrink-0 text-right font-mono tabular-nums ${row.amountClass}`}
              >
                {row.amount.startsWith('+') ? row.amount.slice(1) : row.amount}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
