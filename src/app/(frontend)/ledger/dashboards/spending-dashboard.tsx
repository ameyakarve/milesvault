'use client'

import type { OverviewViewProps } from '../overview-view'
import { DashboardScaffold, type DashboardConfig } from './dashboard-scaffold'

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
  return <DashboardScaffold {...props} config={CONFIG} />
}
