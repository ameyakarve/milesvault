'use client'

import { Container, Text } from '@mantine/core'
import { LineChart, DonutChart } from '@mantine/charts'
import type { OverviewViewProps, CompositionRow } from '../overview-view'
import { Treemap } from './treemap'
import { DONUT_PALETTE } from './donut'
import { Sankey } from './sankey'
import { SpendHeatmap } from './spend-heatmap'
import { Masonry } from './masonry'
import { DashCard, StatCard } from './cards'
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

  const trendData =
    monthlyNet?.points.map((p) => ({ month: p.x, amount: p.y })) ?? []
  const trendValueFormatter = (v: number) => `${symbol}${compactAmount(v, currency)}`

  return (
    <div
      data-overview-root
      data-dashboard-slug="credit-card"
      className="flex-1 flex flex-col bg-white overflow-y-auto"
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

        <DashCard title="Monthly spend" right={monthlyNet?.totalLabel ? (
          <Text size="xs" c="dimmed">
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {monthlyNet.totalLabel}
            </span>{' '}
            <span className="text-slate-400">spent over period</span>
          </Text>
        ) : null}>
          {trendData.length === 0 ? (
            <Text size="xs" c="dimmed" ta="center" py="md">
              No activity in selected range
            </Text>
          ) : (
            <LineChart
              h={240}
              data={trendData}
              dataKey="month"
              series={[{ name: 'amount', label: 'Spend', color: ROSE }]}
              curveType="linear"
              withDots
              dotProps={{ r: 4, stroke: 'white', strokeWidth: 1.5 }}
              valueFormatter={trendValueFormatter}
              tickLine="none"
              gridAxis="y"
              withLegend={false}
            />
          )}
        </DashCard>

        {spendCalendar && spendCalendar.days.length > 0 && (
          <DashCard title="Spend calendar">
            <SpendHeatmap days={spendCalendar.days} currency={spendCalendar.currency} />
          </DashCard>
        )}

        {cardsUsed && cardsUsed.rows.length > 0 && (
          <DashCard title="Cards used">
            <DonutWithLegend rows={cardsUsed.rows} />
          </DashCard>
        )}

        {categoryTreemap && (categoryTreemap.children?.length ?? 0) > 0 && (
          <DashCard title="Spend by category">
            <Treemap root={categoryTreemap} />
          </DashCard>
        )}

        {paidFrom && paidFrom.rows.length > 0 && (
          <DashCard title="Paid from">
            <DonutWithLegend rows={paidFrom.rows} />
          </DashCard>
        )}

        {cardSankey && cardSankey.links.length > 0 && (
          <DashCard title="Money flow">
            <Sankey data={cardSankey} />
          </DashCard>
        )}

        <DashCard title="Recent charges">
          {events.rows.length === 0 ? (
            <Text size="xs" c="dimmed" py="xs">No notable charges</Text>
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
        </DashCard>
        </Masonry>
      </Container>
    </div>
  )
}

function DonutWithLegend({ rows }: { rows: CompositionRow[] }) {
  const total = rows.reduce((acc, r) => acc + (r.value ?? 0), 0)
  if (total <= 0) return null
  const data = rows.map((r, i) => ({
    name: r.leaf,
    value: r.value ?? 0,
    color: DONUT_PALETTE[i % DONUT_PALETTE.length]!,
  }))
  return (
    <div className="flex flex-col items-center gap-4">
      <DonutChart
        data={data}
        size={160}
        thickness={28}
        withLabels={false}
        withTooltip
      />
      <div className="w-full flex flex-col gap-1.5 text-[12px] min-w-0">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
            <span className="flex-1 truncate text-slate-700">{d.name}</span>
            <span className={`font-mono tabular-nums shrink-0 ${rows[i]!.amountClass}`}>
              {rows[i]!.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
