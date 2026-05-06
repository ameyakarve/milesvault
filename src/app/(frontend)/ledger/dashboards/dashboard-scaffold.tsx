'use client'

import { useCallback, useMemo, type ReactNode } from 'react'
import * as Plot from '@observablehq/plot'
import { Text } from '@mantine/core'
import { AreaChart } from '@mantine/charts'
import type { OverviewViewProps } from '../overview-view'
import { PlotChart } from './plot-chart'
import { Masonry } from './masonry'
import { DashCard, StatCard } from './cards'
import { CURRENCY_SYMBOL, compactAmount } from './format'

// Palettes carry semantic meaning: an "asset" dashboard reads in brand teal
// (positive flow / things-you-own); a "liability" dashboard reads in rose
// (outflow / things-you-owe). Composition bars use the opposite-direction
// color when a row's raw amount has the opposite semantic, so e.g. a
// liability dashboard with a payment-in counter-account renders that bar
// teal.
type Palette = 'asset' | 'liability'

const PALETTES: Record<Palette, { line: string; areaOpacity: number; positive: string; negative: string }> = {
  asset: {
    line: '#00685f',
    areaOpacity: 0.18,
    positive: '#00685f',
    negative: '#e11d48',
  },
  liability: {
    line: '#e11d48',
    areaOpacity: 0.14,
    positive: '#e11d48',
    negative: '#00685f',
  },
}

export type DashboardConfig = {
  slug: string
  trendTitle: string
  compositionTitle: string
  eventsTitle: string
  emptyEventsLabel: string
  palette: Palette
  // Whether the raw running balance for this account family is credit-normal
  // (Liabilities, Income) and should be negated for human-readable trend
  // display (so income climbs upward etc.).
  negateBalance: boolean
}

export function DashboardScaffold(
  props: OverviewViewProps & {
    config: DashboardConfig
    // Optional dashboard-specific card rendered between trend and composition
    // (e.g. category treemap on the Expenses dashboard).
    midCard?: { title: string; body: ReactNode } | null
  },
) {
  const { trend, composition, events, config, midCard, headerStats } = props
  const palette = PALETTES[config.palette]
  const symbol = CURRENCY_SYMBOL[trend.currency] ?? ''

  const trendData = useMemo(() => {
    const pts = config.negateBalance ? trend.points.map((p) => ({ ...p, y: -p.y })) : trend.points
    return pts.map((p) => ({ month: p.x, value: p.y }))
  }, [trend.points, config.negateBalance])

  const trendValueFormatter = (v: number) => `${symbol}${compactAmount(v, trend.currency)}`

  // Composition chart stays on Plot — Mantine's BarChart can't render the
  // inline value labels (Plot.text alongside Plot.barX) that make this panel
  // legible, and the divergent/unidirectional auto-switch is bespoke logic.
  const renderComposition = useCallback(() => {
    if (composition.rows.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'p-6 text-[11px] text-slate-400'
      empty.textContent = 'No counter-account activity'
      return empty
    }
    const data = composition.rows.map((r) => ({
      account: `${r.prefix}${r.leaf}`,
      value: (r.amountClass.includes('rose') ? -1 : 1) * r.scale * 100,
      label: r.amount,
    }))
    const allSameSign =
      data.length > 0 && (data.every((d) => d.value > 0) || data.every((d) => d.value < 0))
    const INSIDE_THRESHOLD = 50
    return allSameSign
      ? renderUnidirectional(data, palette, INSIDE_THRESHOLD)
      : renderDivergent(data, palette, INSIDE_THRESHOLD)
  }, [composition.rows, palette])

  return (
    <div
      data-overview-root
      data-dashboard-slug={config.slug}
      className="flex-1 flex flex-col bg-white overflow-y-auto"
    >
      <Masonry className="p-6">
        {headerStats && <StatCard label="Balance" value={headerStats.balance} />}
        {headerStats?.netIn && (
          <StatCard label="Net In" value={headerStats.netIn} valueColor="#00685f" />
        )}
        {headerStats?.netOut && (
          <StatCard label="Net Out" value={headerStats.netOut} valueColor="#e11d48" />
        )}

        <DashCard title={config.trendTitle}>
          {trendData.length === 0 ? (
            <Text size="xs" c="dimmed" ta="center" py="md">No data in selected range</Text>
          ) : (
            <AreaChart
              h={260}
              data={trendData}
              dataKey="month"
              series={[{ name: 'value', label: config.trendTitle, color: palette.line }]}
              curveType="monotone"
              withDots
              dotProps={{ r: 3.5, stroke: 'white', strokeWidth: 1.5 }}
              fillOpacity={palette.areaOpacity}
              valueFormatter={trendValueFormatter}
              tickLine="none"
              gridAxis="y"
              withLegend={false}
            />
          )}
        </DashCard>

        {midCard && <DashCard title={midCard.title}>{midCard.body}</DashCard>}

        <DashCard
          title={config.compositionTitle}
          right={
            composition.moreCount != null && composition.moreCount > 0 ? (
              <Text size="xs" fs="italic" c="dimmed">+{composition.moreCount} more</Text>
            ) : null
          }
        >
          <PlotChart render={renderComposition} className="w-full" />
        </DashCard>

        <DashCard title={config.eventsTitle}>
          {events.rows.length === 0 ? (
            <Text size="xs" c="dimmed" py="xs">{config.emptyEventsLabel}</Text>
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
                    {row.amount}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DashCard>
      </Masonry>
    </div>
  )
}

type CompositionDatum = { account: string; value: number; label: string }

function renderDivergent(
  data: CompositionDatum[],
  palette: (typeof PALETTES)[Palette],
  insideThreshold: number,
) {
  const insidePositives = data.filter((d) => d.value >= insideThreshold)
  const insideNegatives = data.filter((d) => d.value <= -insideThreshold)
  const outsidePositives = data.filter((d) => d.value >= 0 && d.value < insideThreshold)
  const outsideNegatives = data.filter((d) => d.value < 0 && d.value > -insideThreshold)
  return Plot.plot({
    height: Math.max(220, data.length * 40),
    marginLeft: 220,
    marginRight: 130,
    marginTop: 16,
    marginBottom: 16,
    style: { background: 'transparent', fontFamily: 'inherit', fontSize: '11px' },
    x: { axis: null, domain: [-110, 110] },
    y: { label: null, domain: data.map((d) => d.account), tickSize: 0 },
    marks: [
      Plot.ruleX([0], { stroke: '#cbd5e1', strokeWidth: 1 }),
      Plot.barX(data, {
        x: 'value',
        y: 'account',
        fill: (d) => (d.value < 0 ? palette.negative : palette.positive),
        fillOpacity: 0.92,
      }),
      Plot.text(outsidePositives, {
        x: 'value',
        y: 'account',
        text: 'label',
        textAnchor: 'start',
        dx: 6,
        fill: '#0f172a',
        fontWeight: 500,
      }),
      Plot.text(outsideNegatives, {
        x: 'value',
        y: 'account',
        text: 'label',
        textAnchor: 'end',
        dx: -6,
        fill: '#0f172a',
        fontWeight: 500,
      }),
      Plot.text(insidePositives, {
        x: 'value',
        y: 'account',
        text: 'label',
        textAnchor: 'end',
        dx: -6,
        fill: 'white',
        fontWeight: 600,
      }),
      Plot.text(insideNegatives, {
        x: 'value',
        y: 'account',
        text: 'label',
        textAnchor: 'start',
        dx: 6,
        fill: 'white',
        fontWeight: 600,
      }),
    ],
  })
}

function renderUnidirectional(
  data: CompositionDatum[],
  palette: (typeof PALETTES)[Palette],
  insideThreshold: number,
) {
  const rows = data.map((d) => ({
    account: d.account,
    abs: Math.abs(d.value),
    value: d.value,
    label: d.label,
  }))
  const inside = rows.filter((r) => r.abs >= insideThreshold)
  const outside = rows.filter((r) => r.abs < insideThreshold)
  return Plot.plot({
    height: Math.max(220, rows.length * 40),
    marginLeft: 220,
    marginRight: 150,
    marginTop: 16,
    marginBottom: 16,
    style: { background: 'transparent', fontFamily: 'inherit', fontSize: '11px' },
    x: { axis: null, domain: [0, 110] },
    y: { label: null, domain: rows.map((r) => r.account), tickSize: 0 },
    marks: [
      Plot.ruleX([0], { stroke: '#cbd5e1', strokeWidth: 1 }),
      Plot.barX(rows, {
        x: 'abs',
        y: 'account',
        fill: (d) => (d.value < 0 ? palette.negative : palette.positive),
        fillOpacity: 0.92,
      }),
      Plot.text(outside, {
        x: 'abs',
        y: 'account',
        text: 'label',
        textAnchor: 'start',
        dx: 6,
        fill: '#0f172a',
        fontWeight: 500,
      }),
      Plot.text(inside, {
        x: 'abs',
        y: 'account',
        text: 'label',
        textAnchor: 'end',
        dx: -6,
        fill: 'white',
        fontWeight: 600,
      }),
    ],
  })
}
