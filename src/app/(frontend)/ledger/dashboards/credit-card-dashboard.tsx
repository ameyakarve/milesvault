'use client'

import { useCallback } from 'react'
import * as Plot from '@observablehq/plot'
import { LayerCard } from '@cloudflare/kumo/components/layer-card'
import type { OverviewViewProps } from '../overview-view'
import { PlotChart } from './plot-chart'
import { Treemap } from './treemap'
import { Donut, DONUT_PALETTE } from './donut'
import { Sankey } from './sankey'
import { SpendHeatmap } from './spend-heatmap'
import { Masonry } from './masonry'
import { StatTile } from '../stat-tile'
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
  const {
    events,
    monthlyNet,
    categoryTreemap,
    cardSankey,
    paidFrom,
    cardsUsed,
    spendCalendar,
    headerStats,
  } = props
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
      <Masonry className="p-6">
        {headerStats && <StatTile label="Balance" value={headerStats.balance} />}
        {headerStats?.netIn && (
          <StatTile label="Net In" value={headerStats.netIn} valueClass="text-[#00685f]" />
        )}
        {headerStats?.netOut && (
          <StatTile label="Net Out" value={headerStats.netOut} valueClass="text-rose-600" />
        )}

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

        {spendCalendar && spendCalendar.days.length > 0 && (
          <LayerCard className="flex flex-col rounded-md p-4">
            <div className="text-[12px] font-medium text-slate-700 mb-3">Spend calendar</div>
            <SpendHeatmap days={spendCalendar.days} currency={spendCalendar.currency} />
          </LayerCard>
        )}

        {cardsUsed && cardsUsed.rows.length > 0 && (
          <LayerCard className="flex flex-col rounded-md p-4">
            <div className="text-[12px] font-medium text-slate-700 mb-3">Cards used</div>
            <Donut rows={cardsUsed.rows} palette={DONUT_PALETTE} />
          </LayerCard>
        )}

        {categoryTreemap && (categoryTreemap.children?.length ?? 0) > 0 && (
          <LayerCard className="flex flex-col rounded-md p-4">
            <div className="text-[12px] font-medium text-slate-700 mb-3">Spend by category</div>
            <Treemap root={categoryTreemap} />
          </LayerCard>
        )}

        {paidFrom && paidFrom.rows.length > 0 && (
          <LayerCard className="flex flex-col rounded-md p-4">
            <div className="text-[12px] font-medium text-slate-700 mb-3">Paid from</div>
            <Donut rows={paidFrom.rows} palette={DONUT_PALETTE} />
          </LayerCard>
        )}

        {cardSankey && cardSankey.links.length > 0 && (
          <LayerCard className="flex flex-col rounded-md p-4">
            <div className="text-[12px] font-medium text-slate-700 mb-3">Money flow</div>
            <Sankey data={cardSankey} />
          </LayerCard>
        )}

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
      </Masonry>
    </div>
  )
}
