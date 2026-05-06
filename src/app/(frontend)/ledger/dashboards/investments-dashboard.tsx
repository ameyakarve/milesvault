'use client'

import type { OverviewViewProps } from '../overview-view'
import { DashboardScaffold, type DashboardConfig } from './dashboard-scaffold'

const CONFIG: DashboardConfig = {
  slug: 'investments',
  // Cost-basis sum, not market value — we don't have price feeds yet.
  trendTitle: 'Invested capital over time',
  compositionTitle: 'Top counter-accounts',
  eventsTitle: 'Notable transactions',
  emptyEventsLabel: 'No notable transactions',
  palette: 'asset',
  negateBalance: false,
}

export function InvestmentsDashboard(props: OverviewViewProps) {
  return <DashboardScaffold {...props} config={CONFIG} />
}
