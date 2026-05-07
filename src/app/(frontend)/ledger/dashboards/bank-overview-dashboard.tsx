'use client'

import { useCallback } from 'react'
import * as Plot from '@observablehq/plot'
import { Container, Text } from '@mantine/core'
import { AreaChart } from '@mantine/charts'
import type { OverviewViewProps } from '../overview-view'
import { PlotChart } from './plot-chart'
import { Masonry } from './masonry'
import { DashCard, StatCard } from './cards'

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

// Bank-overview dashboard. Bound by the taxonomy at Assets:Bank, which means
// every Assets:Bank:* account renders this layout in the Overview tab.
export function BankOverviewDashboard(props: OverviewViewProps) {
  const { trend, composition, events, headerStats } = props
  const symbol = CURRENCY_SYMBOL[trend.currency] ?? ''
  const trendData = trend.points.map((p) => ({ month: p.x, balance: p.y }))
  const trendValueFormatter = (v: number) => `${symbol}${compactAmount(v, trend.currency)}`

  // The composition chart stays on Plot — Mantine's BarChart has no inline
  // data-label support, and the diverging positive/negative bars with
  // value labels alongside are central to the panel's readability.
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
      height: Math.max(220, data.length * 40),
      marginLeft: 220,
      marginRight: 110,
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
          fill: (d) => (d.value < 0 ? '#e11d48' : '#00685f'),
          fillOpacity: 0.92,
        }),
        Plot.text(positives, {
          x: 'value',
          y: 'account',
          text: 'label',
          textAnchor: 'start',
          dx: 6,
          fill: '#0f172a',
          fontWeight: 500,
        }),
        Plot.text(negatives, {
          x: 'value',
          y: 'account',
          text: 'label',
          textAnchor: 'end',
          dx: -6,
          fill: '#0f172a',
          fontWeight: 500,
        }),
      ],
    })
  }, [composition.rows])

  return (
    <div
      data-overview-root
      data-dashboard-slug="bank-overview"
      className="flex-1 flex flex-col bg-[#f7f9fb] overflow-y-auto"
    >
      <Container fluid p="lg" w="100%">
        <Masonry>
        {headerStats && <StatCard label="Balance" value={headerStats.balance} />}
        {headerStats?.netIn && (
          <StatCard label="Net In" value={headerStats.netIn} valueColor="#00685f" />
        )}
        {headerStats?.netOut && (
          <StatCard label="Net Out" value={headerStats.netOut} valueColor="#e11d48" />
        )}

        <DashCard title={trend.title}>
          {trendData.length === 0 ? (
            <Text size="xs" c="dimmed" ta="center" py="md">No data in selected range</Text>
          ) : (
            <AreaChart
              h={260}
              data={trendData}
              dataKey="month"
              series={[{ name: 'balance', label: 'Balance', color: '#00685f' }]}
              curveType="monotone"
              withDots
              dotProps={{ r: 3.5, stroke: 'white', strokeWidth: 1.5 }}
              fillOpacity={0.18}
              valueFormatter={trendValueFormatter}
              tickLine="none"
              gridAxis="y"
              withLegend={false}
            />
          )}
        </DashCard>

        <DashCard
          title={composition.title}
          right={
            composition.moreCount != null && composition.moreCount > 0 ? (
              <Text size="xs" fs="italic" c="dimmed">+{composition.moreCount} more</Text>
            ) : null
          }
        >
          <PlotChart render={renderComposition} className="w-full" />
        </DashCard>

        <DashCard title={events.title}>
          {events.rows.length === 0 ? (
            <Text size="xs" c="dimmed" py="xs">No notable events</Text>
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
                  <div className={`shrink-0 truncate mr-4 min-w-[120px] max-w-[200px] ${i === 0 ? 'font-semibold text-slate-900' : 'font-medium text-slate-900'}`}>
                    {row.payee}
                  </div>
                  <div className="flex-1 text-slate-600 truncate">{row.narration}</div>
                  <div className={`w-[140px] shrink-0 text-right font-mono tabular-nums ${row.amountClass}`}>
                    {row.amount}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DashCard>
        </Masonry>
      </Container>
    </div>
  )
}
