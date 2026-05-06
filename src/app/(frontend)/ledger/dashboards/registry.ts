import type { ComponentType } from 'react'
import type { OverviewViewProps } from '../overview-view'
import { BankOverviewDashboard } from './bank-overview-dashboard'
import { CreditCardDashboard } from './credit-card-dashboard'
import { IncomeDashboard } from './income-dashboard'
import { InvestmentsDashboard } from './investments-dashboard'
import { NetWorthDashboard } from './net-worth-dashboard'
import { SpendingDashboard } from './spending-dashboard'

// Registry mapping dashboard slugs (as bound by the taxonomy) to React
// components. Each component takes the same OverviewViewProps shape produced
// by deriveOverview() so the data plumbing is shared.
//
// Slugs without a registered component fall through to the legacy OverviewView,
// which keeps account types we haven't built dashboards for yet working.
export type DashboardComponent = ComponentType<OverviewViewProps>

export const DASHBOARD_REGISTRY: Record<string, DashboardComponent> = {
  'bank-overview': BankOverviewDashboard,
  'credit-card': CreditCardDashboard,
  income: IncomeDashboard,
  investments: InvestmentsDashboard,
  'net-worth': NetWorthDashboard,
  spending: SpendingDashboard,
}

export function getDashboardComponent(slug: string): DashboardComponent | null {
  return DASHBOARD_REGISTRY[slug] ?? null
}
