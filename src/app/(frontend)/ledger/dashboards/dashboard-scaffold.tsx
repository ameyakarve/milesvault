'use client'

import { useCallback, useMemo, type ReactNode } from 'react'
import * as Plot from '@observablehq/plot'
import { LayerCard } from '@cloudflare/kumo/components/layer-card'
import type { OverviewViewProps } from '../overview-view'
import { PlotChart } from './plot-chart'
import { Masonry } from './masonry'
import { StatTile } from '../stat-tile'
import { CURRENCY_SYMBOL, compactAmount } from './format'

// Palettes carry semantic meaning: an "asset" dashboard reads in brand teal
// (positive flow / things-you-own); a "liability" dashboard reads in rose
// (outflow / things-you-owe). Composition bars use the opposite-direction
// color when a row's raw amount has the opposite semantic, so e.g. a
// liability dashboard with a payment-in counter-account renders that bar
// teal.
type Palette = 'asset' | 'liability'

const PALETTES: Record<Palette, { line: string; area: string; areaOpacity: number; positive: string; negative: string }> = {
  asset: {
    line: '#00685f',
    area: '#00685f',
    areaOpacity: 0.18,
    positive: '#00685f',
    negative: '#e11d48',
  },
  liability: {
    line: '#e11d48',
    area: '#e11d48',
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

  const trendPoints = useMemo(
    () => (config.negateBalance ? trend.points.map((p) => ({ ...p, y: -p.y })) : trend.points),
    [trend.points, config.negateBalance],
  )

  const renderTrend = useCallback(() => {
    if (trendPoints.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'p-6 text-[11px] text-slate-400 text-center'
      empty.textContent = 'No data in selected range'
      return empty
    }
    return Plot.plot({
      height: 260,
      marginLeft: 76,
      marginRight: 24,
      marginBottom: 32,
      style: { background: 'transparent', fontFamily: 'inherit', fontSize: '11px' },
      x: { type: 'point', label: null, tickSize: 0, domain: trendPoints.map((p) => p.x) },
      y: {
        grid: true,
        label: null,
        nice: true,
        tickFormat: (d: number) => `${symbol}${compactAmount(d, trend.currency)}`,
      },
      marks: [
        Plot.ruleY([0], { stroke: '#cbd5e1' }),
        Plot.areaY(trendPoints, {
          x: 'x',
          y: 'y',
          curve: 'monotone-x',
          fill: palette.area,
          fillOpacity: palette.areaOpacity,
        }),
        Plot.lineY(trendPoints, {
          x: 'x',
          y: 'y',
          curve: 'monotone-x',
          stroke: palette.line,
          strokeWidth: 2.5,
        }),
        Plot.dot(trendPoints, {
          x: 'x',
          y: 'y',
          fill: palette.line,
          stroke: 'white',
          strokeWidth: 1.5,
          r: 3.5,
        }),
        Plot.tip(trendPoints, Plot.pointerX({ x: 'x', y: 'y', title: 'label' })),
      ],
    })
  }, [trendPoints, trend.currency, symbol, palette])

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
    // When the data is all one sign (common for spending/income where every
    // counter-account is on the same side), render unidirectional bars from
    // 0 → |value|. Bars then fill the chart instead of clustering on one
    // side. Color still reflects the original sign so a payment-in on a
    // liability dashboard reads teal.
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
        {headerStats && <StatTile label="Balance" value={headerStats.balance} />}
        {headerStats?.netIn && (
          <StatTile label="Net In" value={headerStats.netIn} valueClass="text-[#00685f]" />
        )}
        {headerStats?.netOut && (
          <StatTile label="Net Out" value={headerStats.netOut} valueClass="text-rose-600" />
        )}

        <LayerCard className="flex flex-col rounded-md p-4">
          <div className="text-[12px] font-medium text-slate-700 mb-3">{config.trendTitle}</div>
          <PlotChart render={renderTrend} className="w-full" />
        </LayerCard>

        {midCard && (
          <LayerCard className="flex flex-col rounded-md p-4">
            <div className="text-[12px] font-medium text-slate-700 mb-3">{midCard.title}</div>
            {midCard.body}
          </LayerCard>
        )}

        <LayerCard className="flex flex-col rounded-md p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[12px] font-medium text-slate-700">{config.compositionTitle}</div>
            {composition.moreCount != null && composition.moreCount > 0 && (
              <div className="text-[11px] italic text-slate-400">
                +{composition.moreCount} more
              </div>
            )}
          </div>
          <PlotChart render={renderComposition} className="w-full" />
        </LayerCard>

        <LayerCard className="flex flex-col rounded-md p-4">
          <div className="text-[12px] font-medium text-slate-700 mb-3">{config.eventsTitle}</div>
          {events.rows.length === 0 ? (
            <div className="py-3 text-[11px] text-slate-400">{config.emptyEventsLabel}</div>
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
        </LayerCard>
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
