'use client'

import { useCallback } from 'react'
import * as Plot from '@observablehq/plot'
import { LayerCard } from '@cloudflare/kumo/components/layer-card'
import type { OverviewViewProps, CompositionRow } from '../overview-view'
import { PlotChart } from './plot-chart'
import { CURRENCY_SYMBOL, compactAmount } from './format'

const ROSE = '#e11d48'

// Credit-card dashboard. Bound by the taxonomy at Liabilities:CreditCards;
// every Liabilities:CreditCards:* account renders this layout.
//
// Beancount Liabilities are credit-normal: charges are negative postings on
// the CC account (balance grows worse), payments are positive postings
// (balance grows better). The "net spend" trend negates so positive bars
// read as "added to debt this month" — the conventional billing view.
export function CreditCardDashboard(props: OverviewViewProps) {
  const { events, monthlyNet, categoryBreakdown, paidFrom } = props
  const currency = monthlyNet?.currency ?? 'INR'
  const symbol = CURRENCY_SYMBOL[currency] ?? ''

  const renderNetTrend = useCallback(() => {
    const points = monthlyNet?.points ?? []
    if (points.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'p-6 text-[11px] text-slate-400 text-center'
      empty.textContent = 'No activity in selected range'
      return empty
    }
    return Plot.plot({
      height: 240,
      marginLeft: 76,
      marginRight: 24,
      marginBottom: 32,
      style: { background: 'transparent', fontFamily: 'inherit', fontSize: '11px' },
      x: { type: 'band', label: null, tickSize: 0, domain: points.map((p) => p.x), padding: 0.25 },
      y: {
        grid: true,
        label: null,
        nice: true,
        tickFormat: (d: number) => `${symbol}${compactAmount(d, currency)}`,
      },
      marks: [
        Plot.line(points, {
          x: 'x',
          y: 'y',
          stroke: '#94a3b8',
          strokeWidth: 1.5,
        }),
        Plot.dot(points, {
          x: 'x',
          y: 'y',
          fill: ROSE,
          stroke: 'white',
          strokeWidth: 1.5,
          r: 4,
        }),
        Plot.tip(points, Plot.pointerX({ x: 'x', y: 'y', title: 'label' })),
      ],
    })
  }, [monthlyNet, symbol, currency])

  const headlineTotal = monthlyNet?.totalLabel ?? ''

  return (
    <div
      data-overview-root
      data-dashboard-slug="credit-card"
      className="flex-1 flex flex-col bg-white overflow-y-auto"
    >
      <div className="p-6 space-y-6">
        <LayerCard className="flex flex-col rounded-md p-4">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-[12px] font-medium text-slate-700">Monthly spend</div>
            {headlineTotal && (
              <div className="text-[11px] text-slate-500">
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {headlineTotal}
                </span>{' '}
                <span className="text-slate-400">spent over period</span>
              </div>
            )}
          </div>
          <PlotChart render={renderNetTrend} className="w-full" />
        </LayerCard>

        <div
          className={`grid gap-6 items-start ${
            paidFrom && paidFrom.rows.length > 0 ? 'grid-cols-2' : 'grid-cols-1'
          }`}
        >
          <LayerCard className="flex flex-col rounded-md p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[12px] font-medium text-slate-700">Where this card spent</div>
              {categoryBreakdown && categoryBreakdown.moreCount > 0 && (
                <div className="text-[11px] italic text-slate-400">
                  +{categoryBreakdown.moreCount} more
                </div>
              )}
            </div>
            {categoryBreakdown && categoryBreakdown.rows.length > 0 ? (
              <Donut rows={categoryBreakdown.rows} palette={DONUT_PALETTE} />
            ) : (
              <div className="p-6 text-[11px] text-slate-400">No charges in selected range</div>
            )}
          </LayerCard>

          {paidFrom && paidFrom.rows.length > 0 && (
            <LayerCard className="flex flex-col rounded-md p-4">
              <div className="text-[12px] font-medium text-slate-700 mb-3">Paid from</div>
              <Donut rows={paidFrom.rows} palette={DONUT_PALETTE} />
            </LayerCard>
          )}
        </div>

        <LayerCard className="flex flex-col rounded-md p-4">
          <div className="text-[12px] font-medium text-slate-700 mb-3">Recent charges</div>
          {events.rows.length === 0 ? (
            <div className="py-3 text-[11px] text-slate-400">No notable charges</div>
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
                    {/* Drop the leading '+' on charge amounts — on a CC view they read as income otherwise. */}
                    {row.amount.startsWith('+') ? row.amount.slice(1) : row.amount}
                  </div>
                </div>
              ))}
            </div>
          )}
        </LayerCard>

      </div>
    </div>
  )
}

// Categorical palette for donut slices — Tableau-style, Tailwind-aligned.
// Ordered so adjacent slices have high contrast.
const DONUT_PALETTE = [
  '#3b82f6', // blue-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#ef4444', // red-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#ec4899', // pink-500
]

function Donut({ rows, palette }: { rows: CompositionRow[]; palette: string[] }) {
  const total = rows.reduce((acc, r) => acc + (r.value ?? 0), 0)
  if (total <= 0) return null
  const size = 160
  const cx = size / 2
  const cy = size / 2
  const outer = 70
  const inner = 42
  let angle = -Math.PI / 2
  const segments = rows.map((row, i) => {
    const fraction = (row.value ?? 0) / total
    const start = angle
    const end = angle + fraction * 2 * Math.PI
    angle = end
    return {
      row,
      color: palette[i % palette.length]!,
      path:
        rows.length === 1
          ? fullAnnulus(cx, cy, inner, outer)
          : describeArc(cx, cy, inner, outer, start, end),
      fraction,
    }
  })
  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {segments.map((seg, i) => (
          <path
            key={i}
            d={seg.path}
            fill={seg.color}
            fillRule={rows.length === 1 ? 'evenodd' : undefined}
            stroke="white"
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <div className="flex-1 flex flex-col gap-1.5 text-[12px] min-w-0">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: seg.color }}
            />
            <span className="flex-1 truncate text-slate-700">{seg.row.leaf}</span>
            <span className={`font-mono tabular-nums shrink-0 ${seg.row.amountClass}`}>
              {seg.row.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function describeArc(
  cx: number,
  cy: number,
  ri: number,
  ro: number,
  a0: number,
  a1: number,
): string {
  const x0 = cx + ro * Math.cos(a0)
  const y0 = cy + ro * Math.sin(a0)
  const x1 = cx + ro * Math.cos(a1)
  const y1 = cy + ro * Math.sin(a1)
  const x2 = cx + ri * Math.cos(a1)
  const y2 = cy + ri * Math.sin(a1)
  const x3 = cx + ri * Math.cos(a0)
  const y3 = cy + ri * Math.sin(a0)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M ${x0} ${y0} A ${ro} ${ro} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${ri} ${ri} 0 ${large} 0 ${x3} ${y3} Z`
}

function fullAnnulus(cx: number, cy: number, ri: number, ro: number): string {
  return (
    `M ${cx + ro} ${cy} A ${ro} ${ro} 0 1 1 ${cx - ro} ${cy} A ${ro} ${ro} 0 1 1 ${cx + ro} ${cy} Z` +
    `M ${cx + ri} ${cy} A ${ri} ${ri} 0 1 0 ${cx - ri} ${cy} A ${ri} ${ri} 0 1 0 ${cx + ri} ${cy} Z`
  )
}
