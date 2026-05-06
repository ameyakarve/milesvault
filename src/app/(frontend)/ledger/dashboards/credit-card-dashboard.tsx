'use client'

import { useCallback } from 'react'
import * as Plot from '@observablehq/plot'
import { LayerCard } from '@cloudflare/kumo/components/layer-card'
import type { OverviewViewProps, CompositionRow } from '../overview-view'
import { PlotChart } from './plot-chart'
import { CURRENCY_SYMBOL, compactAmount } from './format'

const ROSE = '#e11d48'
const TEAL = '#00685f'

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
    const points = (monthlyNet?.points ?? []).map((p) => ({
      ...p,
      // Negate for display: charge = +, payment-heavy month = -.
      yDisplay: -p.y,
    }))
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
        tickFormat: (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${symbol}${compactAmount(Math.abs(d), currency)}`,
      },
      marks: [
        Plot.ruleY([0], { stroke: '#94a3b8', strokeWidth: 1 }),
        Plot.line(points, {
          x: 'x',
          y: 'yDisplay',
          stroke: '#94a3b8',
          strokeWidth: 1.5,
        }),
        Plot.dot(points, {
          x: 'x',
          y: 'yDisplay',
          fill: (d) => (d.yDisplay >= 0 ? ROSE : TEAL),
          stroke: 'white',
          strokeWidth: 1.5,
          r: 4,
        }),
        Plot.tip(points, Plot.pointerX({ x: 'x', y: 'yDisplay', title: 'label' })),
      ],
    })
  }, [monthlyNet, symbol, currency])

  const renderCategories = useCallback(() => {
    const rows = categoryBreakdown?.rows ?? []
    if (rows.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'p-6 text-[11px] text-slate-400'
      empty.textContent = 'No charges in selected range'
      return empty
    }
    return renderHorizontalBars(rows, ROSE, /* showLabelInside */ true)
  }, [categoryBreakdown])

  const renderPaidFrom = useCallback(() => {
    const rows = paidFrom?.rows ?? []
    if (rows.length === 0) return null
    return renderHorizontalBars(rows, TEAL, /* showLabelInside */ true)
  }, [paidFrom])

  // Negate totalLabel for display so it reads as "amount added to debt"
  // rather than the raw signed posting sum.
  const headlineTotal = (() => {
    const raw = monthlyNet?.totalLabel ?? ''
    if (!raw) return ''
    if (raw.startsWith('+')) return '−' + raw.slice(1)
    if (raw.startsWith('−')) return '+' + raw.slice(1)
    return raw
  })()

  return (
    <div
      data-overview-root
      data-dashboard-slug="credit-card"
      className="flex-1 flex flex-col bg-white overflow-y-auto"
    >
      <div className="p-6 space-y-6">
        <LayerCard className="flex flex-col rounded-md p-4">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-[12px] font-medium text-slate-700">Monthly net spend</div>
            {headlineTotal && (
              <div className="text-[11px] text-slate-500">
                <span
                  className={`font-mono tabular-nums font-semibold ${
                    headlineTotal.startsWith('+') ? 'text-rose-600' : 'text-[#00685f]'
                  }`}
                >
                  {headlineTotal}
                </span>{' '}
                <span className="text-slate-400">net over period</span>
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
            <PlotChart render={renderCategories} className="w-full" />
          </LayerCard>

          {paidFrom && paidFrom.rows.length > 0 && (
            <LayerCard className="flex flex-col rounded-md p-4">
              <div className="text-[12px] font-medium text-slate-700 mb-3">Paid from</div>
              <PlotChart render={renderPaidFrom} className="w-full" />
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

// Horizontal bar chart for category breakdown / paid-from. Bars 0 → |scale|,
// leaf-prominent y-axis labels (the prefix is muted in the plot tooltip; the
// y-axis just shows the leaf). Long bars get inside-white labels; short bars
// get outside-slate.
function renderHorizontalBars(
  rows: CompositionRow[],
  color: string,
  _showLabelInside: boolean,
) {
  const data = rows.map((r) => ({
    leaf: r.leaf,
    prefix: r.prefix,
    full: `${r.prefix}${r.leaf}`,
    value: Math.max(r.scale, 0.04) * 100,
    label: r.amount,
  }))
  const INSIDE_THRESHOLD = 50
  const inside = data.filter((d) => d.value >= INSIDE_THRESHOLD)
  const outside = data.filter((d) => d.value < INSIDE_THRESHOLD)
  return Plot.plot({
    height: Math.max(180, data.length * 40),
    marginLeft: 130,
    marginRight: 130,
    marginTop: 12,
    marginBottom: 12,
    style: { background: 'transparent', fontFamily: 'inherit', fontSize: '11px' },
    x: { axis: null, domain: [0, 110] },
    y: { label: null, domain: data.map((d) => d.leaf), tickSize: 0 },
    marks: [
      Plot.ruleX([0], { stroke: '#cbd5e1', strokeWidth: 1 }),
      Plot.barX(data, {
        x: 'value',
        y: 'leaf',
        fill: color,
        fillOpacity: 0.92,
      }),
      Plot.text(outside, {
        x: 'value',
        y: 'leaf',
        text: 'label',
        textAnchor: 'start',
        dx: 6,
        fill: '#0f172a',
        fontWeight: 500,
      }),
      Plot.text(inside, {
        x: 'value',
        y: 'leaf',
        text: 'label',
        textAnchor: 'end',
        dx: -6,
        fill: 'white',
        fontWeight: 600,
      }),
    ],
  })
}
