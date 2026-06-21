import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { OutstandingCard, SpendCard } from './vault-view'
import type { VaultStats } from '@/durable/ledger-do'
import type { AccountSummaryRow } from '@/durable/ledger-types'

// The two top-row summary tiles (Outstanding + Spend). Synthetic data. Owed and
// spend are per-currency arrays (you can hold an INR card and a USD card; spend
// spans currencies) — each currency is its OWN block with its own legend; never
// summed or ranked (no FX). A card in credit (overpaid) shows as a separate "In
// credit" row inside Outstanding, never netted against what you owe.
const meta: Meta = { title: 'Vault/TopRow' }
export default meta

const base: Pick<
  VaultStats,
  'period' | 'card_count' | 'card_spend' | 'card_spend_trend' | 'bank_total'
> = {
  period: { from: 20260601, to: 20260621 },
  card_count: 5,
  card_spend: [],
  card_spend_trend: [],
  bank_total: [],
}

// Cards per currency, for the by-card breakdown (INR + a couple foreign cards).
const cardRows: AccountSummaryRow[] = [
  { account: 'Liabilities:CreditCards:HDFC:Infinia', currency: 'INR', balance_scaled: '-78000000000000000', scale: 12, last_activity: 20260601 },
  { account: 'Liabilities:CreditCards:Axis:Magnus', currency: 'INR', balance_scaled: '-32000000000000000', scale: 12, last_activity: 20260601 },
  { account: 'Liabilities:CreditCards:ICICI:Sapphiro', currency: 'INR', balance_scaled: '-13456000000000000', scale: 12, last_activity: 20260601 },
  // Overpaid — positive balance = in credit (statement refund / advance payment).
  { account: 'Liabilities:CreditCards:SBI:Prime', currency: 'INR', balance_scaled: '5000000000000000', scale: 12, last_activity: 20260601 },
  { account: 'Liabilities:CreditCards:Amex:Platinum', currency: 'USD', balance_scaled: '-300000000000000', scale: 12, last_activity: 20260601 },
  { account: 'Liabilities:CreditCards:Chase:Sapphire', currency: 'USD', balance_scaled: '-120000000000000', scale: 12, last_activity: 20260601 },
  { account: 'Liabilities:CreditCards:Revolut:Metal', currency: 'EUR', balance_scaled: '-110000000000000', scale: 12, last_activity: 20260601 },
]

const cats = [
  { category: 'Food & Dining', currency: 'INR', total: 18000 },
  { category: 'Travel', currency: 'INR', total: 12000 },
  { category: 'Shopping', currency: 'INR', total: 9000 },
  { category: 'Groceries', currency: 'INR', total: 4200 },
  { category: 'Fuel', currency: 'INR', total: 2000 },
  { category: 'Hotels', currency: 'USD', total: 250 },
  { category: 'Dining', currency: 'USD', total: 70 },
  { category: 'Transit', currency: 'EUR', total: 50 },
  { category: 'Cafés', currency: 'EUR', total: 35 },
]

const single: VaultStats = {
  ...base,
  card_outstanding: [{ currency: 'INR', total: -118456, accounts: 4 }],
  expense_total: [{ currency: 'INR', total: 45200 }],
  expense_categories: cats,
}

const multi: VaultStats = {
  ...base,
  card_outstanding: [
    { currency: 'INR', total: -118456, accounts: 4 },
    { currency: 'USD', total: -420, accounts: 2 },
    { currency: 'EUR', total: -110, accounts: 1 },
  ],
  expense_total: [
    { currency: 'INR', total: 45200 },
    { currency: 'USD', total: 320 },
    { currency: 'EUR', total: 85 },
  ],
  expense_categories: cats,
}

function Row({ stats }: { stats: VaultStats }) {
  return (
    <div className="grid max-w-4xl grid-cols-1 gap-3 bg-background p-6 sm:grid-cols-2">
      <OutstandingCard stats={stats} cardRows={cardRows} names={{}} />
      <SpendCard stats={stats} />
    </div>
  )
}

export const SingleCurrency: StoryObj = { render: () => <Row stats={single} /> }
export const MultiCurrency: StoryObj = { render: () => <Row stats={multi} /> }
