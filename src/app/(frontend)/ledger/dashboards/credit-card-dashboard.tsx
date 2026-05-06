'use client'

import { useCallback, useMemo } from 'react'
import * as Plot from '@observablehq/plot'
import { LayerCard } from '@cloudflare/kumo/components/layer-card'
import type { OverviewViewProps } from '../overview-view'
import { PlotChart } from './plot-chart'

const CURRENCY_SYMBOL: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
}

function compactAmount(n: number, currency: string): string {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (currency === 'INR') {
    if (a >= 1e7) return `${sign}${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1).replace(/\.0$/, '')}Cr`
    if (a >= 1e5) return `${sign}${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1).replace(/\.0$/, '')}L`
    if (a >= 1e3) return `${sign}${Math.round(a / 1e3)}k`
    return `${sign}${a}`
  }
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '')}B`
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`
  if (a >= 1e3) return `${sign}${Math.round(a / 1e3)}k`
  return `${sign}${a}`
}

// Credit-card dashboard. Bound by the taxonomy at Liabilities:CreditCards, which means
// every Liabilities:CreditCards:* account renders this layout in the Overview tab.
//
// Liability accounts carry credit-normal balances, so the raw runningTotal is
// negative as charges accrue. The trend chart negates the values for display
// so the line reads as "amount owed" climbing upward — the conventional
// statement view.
export function CreditCardDashboard(props: OverviewViewProps) {
  const { trend, composition, events } = props
  const symbol = CURRENCY_SYMBOL[trend.currency] ?? ''

  const owedPoints = useMemo(
    () => trend.points.map((p) => ({ ...p, y: -p.y })),
    [trend.points],
  )

  const renderTrend = useCallback(() => {
    if (owedPoints.length === 0) {
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
      x: { type: 'point', label: null, tickSize: 0, domain: owedPoints.map((p) => p.x) },
      y: {
        grid: true,
        label: null,
        nice: true,
        tickFormat: (d: number) => `${symbol}${compactAmount(d, trend.currency)}`,
      },
      marks: [
        Plot.ruleY([0], { stroke: '#cbd5e1' }),
        Plot.areaY(owedPoints, {
          x: 'x',
          y: 'y',
          curve: 'monotone-x',
          fill: '#e11d48',
          fillOpacity: 0.14,
        }),
        Plot.lineY(owedPoints, {
          x: 'x',
          y: 'y',
          curve: 'monotone-x',
          stroke: '#e11d48',
          strokeWidth: 2.5,
        }),
        Plot.dot(owedPoints, {
          x: 'x',
          y: 'y',
          fill: '#e11d48',
          stroke: 'white',
          strokeWidth: 1.5,
          r: 3.5,
        }),
        Plot.tip(owedPoints, Plot.pointerX({ x: 'x', y: 'y', title: 'label' })),
      ],
    })
  }, [owedPoints, trend.currency, symbol])

  const renderComposition = useCallback(() => {
    if (composition.rows.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'p-6 text-[11px] text-slate-400'
      empty.textContent = 'No counter-account activity'
      return empty
    }
    // For a CC, positive raw amounts on counter-accounts are charges that
    // flowed out to Expenses; negative raw amounts are payments that flowed in
    // from Bank. Color reflects that semantic — rose for charges, teal for
    // payments — even though the underlying scale value is the same shape as
    // the bank dashboard.
    const data = composition.rows.map((r) => ({
      account: `${r.prefix}${r.leaf}`,
      value: (r.amountClass.includes('rose') ? -1 : 1) * r.scale * 100,
      label: r.amount,
    }))
    // For long bars the outside-the-bar slot collides with the y-axis
    // labels. Render those labels inside the bar tip (toward zero) with
    // white text so the bar fill is the contrast surface.
    const INSIDE_THRESHOLD = 50
    const insidePositives = data.filter((d) => d.value >= INSIDE_THRESHOLD)
    const insideNegatives = data.filter((d) => d.value <= -INSIDE_THRESHOLD)
    const outsidePositives = data.filter((d) => d.value >= 0 && d.value < INSIDE_THRESHOLD)
    const outsideNegatives = data.filter((d) => d.value < 0 && d.value > -INSIDE_THRESHOLD)
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
          fill: (d) => (d.value < 0 ? '#00685f' : '#e11d48'),
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
  }, [composition.rows])

  return (
    <div
      data-overview-root
      data-dashboard-slug="credit-card"
      className="flex-1 flex flex-col bg-white overflow-y-auto"
    >
      <div className="p-6 space-y-6">
        <LayerCard className="flex flex-col rounded-md p-4">
          <div className="text-[12px] font-medium text-slate-700 mb-3">Amount owed over time</div>
          <PlotChart render={renderTrend} className="w-full" />
        </LayerCard>

        <LayerCard className="flex flex-col rounded-md p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[12px] font-medium text-slate-700">Top spend categories</div>
            {composition.moreCount != null && composition.moreCount > 0 && (
              <div className="text-[11px] italic text-slate-400">
                +{composition.moreCount} more
              </div>
            )}
          </div>
          <PlotChart render={renderComposition} className="w-full" />
        </LayerCard>

        <LayerCard className="flex flex-col rounded-md p-4">
          <div className="text-[12px] font-medium text-slate-700 mb-3">Notable charges</div>
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
                    {row.amount}
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
