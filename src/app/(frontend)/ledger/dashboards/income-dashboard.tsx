'use client'

import type { OverviewViewProps } from '../overview-view'
import { DashboardScaffold, type DashboardConfig } from './dashboard-scaffold'

const CONFIG: DashboardConfig = {
  slug: 'income',
  // Income accounts are credit-normal so the raw balance grows negative.
  // Negate for display so cumulative income climbs upward.
  trendTitle: 'Cumulative income',
  compositionTitle: 'Top destinations',
  eventsTitle: 'Notable income',
  emptyEventsLabel: 'No income in range',
  palette: 'asset',
  negateBalance: true,
}

export function IncomeDashboard(props: OverviewViewProps) {
  return <DashboardScaffold {...props} config={CONFIG} />
}
