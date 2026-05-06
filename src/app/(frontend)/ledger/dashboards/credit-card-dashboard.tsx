'use client'

import { Container } from '@mantine/core'
import { Treemap } from '@mantine/charts'
import type { OverviewViewProps } from '../overview-view'
import { SpendHeatmap } from './spend-heatmap'
import { Masonry } from './masonry'
import { DashCard } from './cards'
import { CURRENCY_SYMBOL, colorizeTreemap, compactAmount } from './format'
import {
  ActivityCard,
  DayOfWeekCard,
  MoneyFlowCard,
  StatementSummaryCard,
  TopMerchantsCard,
} from './cc-cards'

// Credit-card dashboard. Bound by the taxonomy at Liabilities:CreditCards;
// every Liabilities:CreditCards:* account renders this layout.
//
// Beancount Liabilities are credit-normal: charges are negative postings on
// the CC account (balance grows worse), payments are positive postings
// (balance grows better).
export function CreditCardDashboard(props: OverviewViewProps) {
  const {
    events,
    monthlyNet,
    categoryTreemap,
    paidFrom,
    cardsUsed,
    spendCalendar,
    headerStats,
    topMerchants,
    dayOfWeek,
  } = props
  const currency = monthlyNet?.currency ?? 'INR'
  const symbol = CURRENCY_SYMBOL[currency] ?? ''
  const valueFormatter = (v: number) => `${symbol}${compactAmount(v, currency)}`

  return (
    <div
      data-overview-root
      data-dashboard-slug="credit-card"
      className="flex-1 flex flex-col bg-white overflow-y-auto"
    >
      <Container fluid p="lg" w="100%">
        <Masonry>
          {headerStats && (
            <StatementSummaryCard balance={headerStats.balance} monthlyNet={monthlyNet} />
          )}

          <ActivityCard events={events} spendCalendar={spendCalendar} currency={currency} />

          <TopMerchantsCard topMerchants={topMerchants} />

          {categoryTreemap && (categoryTreemap.children?.length ?? 0) > 0 && (
            <DashCard title="Spend by category">
              <Treemap
                data={colorizeTreemap(categoryTreemap).children ?? []}
                height={480}
                valueFormatter={valueFormatter}
              />
            </DashCard>
          )}

          <MoneyFlowCard
            paidFrom={paidFrom}
            cardsUsed={cardsUsed}
            categoryTreemap={categoryTreemap}
          />

          <DayOfWeekCard dayOfWeek={dayOfWeek} />

          {spendCalendar && spendCalendar.days.length > 0 && (
            <DashCard title="Spend calendar">
              <SpendHeatmap days={spendCalendar.days} currency={spendCalendar.currency} />
            </DashCard>
          )}
        </Masonry>
      </Container>
    </div>
  )
}
