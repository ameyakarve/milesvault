'use client'

import type { OverviewViewProps } from '../overview-view'
import { DashboardScaffold, type DashboardConfig } from './dashboard-scaffold'

const CONFIG: DashboardConfig = {
  slug: 'net-worth',
  // Currently only sums Assets:* — we don't subtract Liabilities yet, so the
  // honest title is "Total assets". When liability subtraction lands, retitle.
  trendTitle: 'Total assets over time',
  compositionTitle: 'Top counter-accounts',
  eventsTitle: 'Notable transactions',
  emptyEventsLabel: 'No notable transactions',
  palette: 'asset',
  negateBalance: false,
}

export function NetWorthDashboard(props: OverviewViewProps) {
  return <DashboardScaffold {...props} config={CONFIG} />
}
