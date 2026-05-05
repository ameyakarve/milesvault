'use client'

import { useCallback } from 'react'
import * as Plot from '@observablehq/plot'
import type { OverviewViewProps } from '../overview-view'
import { PlotChart } from './plot-chart'

// Bank-overview dashboard. Bound by the taxonomy at Assets:Bank, which means
// every Assets:Bank:* account renders this layout in the Overview tab.
//
// Takes the same OverviewViewProps shape that powers the legacy hand-rolled
// OverviewView — the upstream `deriveOverview()` derivation is reused, only
// the chart rendering swaps to Observable Plot.
export function BankOverviewDashboard(props: OverviewViewProps) {
  const { caption, trend, composition, events } = props

  const renderTrend = useCallback(() => {
    if (trend.points.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'p-6 text-[11px] text-slate-400 text-center'
      empty.textContent = 'No data in selected range'
      return empty
    }
    return Plot.plot({
      height: 220,
      marginLeft: 64,
      marginRight: 16,
      marginBottom: 28,
      style: { background: 'transparent', fontFamily: 'inherit', fontSize: '10px' },
      // Pin the domain to the data order. Without this, Plot's point scale
      // sorts unique values ascending — which on raw month-abbrev strings
      // (`Dec`, `Jan 26`, `Feb`, `Mar`) collapses to alphabetical and
      // scrambles the time axis.
      x: { type: 'point', label: null, tickSize: 0, domain: trend.points.map((p) => p.x) },
      y: { grid: true, label: null, tickFormat: 's', nice: true },
      marks: [
        Plot.ruleY([0], { stroke: '#cbd5e1' }),
        Plot.areaY(trend.points, {
          x: 'x',
          y: 'y',
          curve: 'monotone-x',
          fill: '#00685f',
          fillOpacity: 0.08,
        }),
        Plot.lineY(trend.points, {
          x: 'x',
          y: 'y',
          curve: 'monotone-x',
          stroke: '#00685f',
          strokeWidth: 1.75,
        }),
        Plot.dot(trend.points, {
          x: 'x',
          y: 'y',
          fill: '#00685f',
          r: 2,
        }),
        Plot.tip(trend.points, Plot.pointerX({ x: 'x', y: 'y', title: 'label' })),
      ],
    })
  }, [trend.points])

  const renderComposition = useCallback(() => {
    if (composition.rows.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'p-6 text-[11px] text-slate-400'
      empty.textContent = 'No counter-account activity'
      return empty
    }
    const data = composition.rows.map((r) => ({
      account: `${r.prefix}${r.leaf}`,
      // The CompositionRow `scale` is normalized 0–1 against the largest
      // absolute value; scale*100 makes Plot's bar widths read as a percentage
      // and the `signed` style keeps positive vs negative on opposite sides.
      value: (r.amountClass.includes('rose') ? -1 : 1) * r.scale * 100,
      label: r.amount,
    }))
    const positives = data.filter((d) => d.value >= 0)
    const negatives = data.filter((d) => d.value < 0)
    return Plot.plot({
      height: Math.max(160, data.length * 28),
      marginLeft: 200,
      marginRight: 80,
      marginTop: 8,
      marginBottom: 8,
      style: { background: 'transparent', fontFamily: 'inherit', fontSize: '11px' },
      x: { axis: null, domain: [-110, 110] },
      y: { label: null, domain: data.map((d) => d.account), tickSize: 0 },
      marks: [
        Plot.ruleX([0], { stroke: '#e2e8f0' }),
        Plot.barX(data, {
          x: 'value',
          y: 'account',
          fill: (d) => (d.value < 0 ? '#e11d48' : '#00685f'),
          fillOpacity: 0.85,
        }),
        Plot.text(positives, {
          x: () => 110,
          y: 'account',
          text: 'label',
          textAnchor: 'end',
          dx: -4,
          fill: '#0f172a',
        }),
        Plot.text(negatives, {
          x: () => -110,
          y: 'account',
          text: 'label',
          textAnchor: 'start',
          dx: 4,
          fill: '#e11d48',
        }),
      ],
    })
  }, [composition.rows])

  return (
    <div
      data-overview-root
      data-dashboard-slug="bank-overview"
      className="flex-1 flex flex-col bg-white overflow-y-auto"
    >
      <div className="px-6 py-2 flex items-center border-b border-slate-100 flex-shrink-0 bg-white sticky top-0 z-10">
        <div className="text-[11px] text-slate-500 font-medium">{caption}</div>
      </div>

      <div className="p-6 space-y-6">
        <div className="flex flex-col bg-white border border-slate-200 rounded-md p-4">
          <div className="text-[12px] font-medium text-slate-700 mb-3">{trend.title}</div>
          <PlotChart render={renderTrend} className="w-full" />
        </div>

        <div className="flex flex-col bg-white border border-slate-200 rounded-md p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[12px] font-medium text-slate-700">{composition.title}</div>
            {composition.moreCount != null && composition.moreCount > 0 && (
              <div className="text-[11px] italic text-slate-400">
                +{composition.moreCount} more
              </div>
            )}
          </div>
          <PlotChart render={renderComposition} className="w-full" />
        </div>

        <div className="flex flex-col bg-white border border-slate-200 rounded-md p-4">
          <div className="text-[12px] font-medium text-slate-700 mb-3">{events.title}</div>
          {events.rows.length === 0 ? (
            <div className="py-3 text-[11px] text-slate-400">No notable events</div>
          ) : (
            <div>
              {events.rows.map((row, i) => (
                <div
                  key={i}
                  className={`h-[40px] flex items-center border-b border-slate-100 text-[12px] ${
                    i === 0 ? 'border-t' : ''
                  }`}
                >
                  <div className="w-[100px] font-mono text-slate-500">{row.date}</div>
                  <div className="w-[140px] font-medium text-slate-900 truncate">
                    {row.payee}
                  </div>
                  <div className="flex-1 text-slate-600 truncate">{row.narration}</div>
                  <div
                    className={`w-[130px] text-right font-mono tabular-nums ${row.amountClass}`}
                  >
                    {row.amount}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
