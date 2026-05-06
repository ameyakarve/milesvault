'use client'

import type { OverviewViewProps } from '../overview-view'
import { DashboardScaffold, type DashboardConfig } from './dashboard-scaffold'
import { Treemap, type TreemapNode } from './treemap'

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

export function SpendingDashboard(
  props: OverviewViewProps & { categoryTreemap?: TreemapNode },
) {
  const { categoryTreemap, ...rest } = props
  const midCard =
    categoryTreemap && (categoryTreemap.children?.length ?? 0) > 0
      ? { title: 'Spend by category', body: <Treemap root={categoryTreemap} /> }
      : null
  return <DashboardScaffold {...rest} config={CONFIG} midCard={midCard} />
}
