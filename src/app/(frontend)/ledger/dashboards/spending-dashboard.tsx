'use client'

import { Treemap } from '@mantine/charts'
import type { OverviewViewProps } from '../overview-view'
import { DashboardScaffold, type DashboardConfig } from './dashboard-scaffold'
import { CURRENCY_SYMBOL, colorizeTreemap, compactAmount } from './format'

const CONFIG: DashboardConfig = {
  slug: 'spending',
  trendTitle: 'Cumulative spending',
  // Counter-accounts on an Expenses-rooted view are mostly the wallets that
  // funded the spending (Bank, CC). Title the panel honestly.
  compositionTitle: 'Top funding sources',
  eventsTitle: 'Largest charges',
  emptyEventsLabel: 'No notable charges',
  palette: 'liability',
  negateBalance: false,
}

export function SpendingDashboard(props: OverviewViewProps) {
  const { categoryTreemap } = props
  const currency = props.trend.currency
  const symbol = CURRENCY_SYMBOL[currency] ?? ''
  const midCard =
    categoryTreemap && (categoryTreemap.children?.length ?? 0) > 0
      ? {
          title: 'Spend by category',
          body: (
            <Treemap
              data={colorizeTreemap(categoryTreemap).children ?? []}
              height={480}
              valueFormatter={(v) => `${symbol}${compactAmount(v, currency)}`}
            />
          ),
        }
      : null
  return <DashboardScaffold {...props} config={CONFIG} midCard={midCard} />
}
