import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CreditCardCard } from './vault-view'

const meta: Meta = { title: 'Vault/CardTile' }
export default meta

export const Default: StoryObj = {
  render: () => (
    <div className="max-w-md space-y-3 bg-background p-6">
      <CreditCardCard
        row={{
          account: 'Liabilities:CreditCards:Demo:Sample:1234',
          currency: 'INR',
          balance_scaled: '12345000000000000',
          scale: 12,
          last_activity: 20260430,
        }}
        names={{}}
        trend={{ currency: 'INR', months: [12000, 18000, 9000, 22000, 15000, 50000] }}
        meta={{
          reward_label: 'Cashback',
          reward_account: 'Assets:Receivable:Demo',
          reward_balance: 450,
          reward_pending: 120,
          reward_unit: 'INR',
        }}
      />
      <CreditCardCard
        row={{
          account: 'Liabilities:CreditCards:Demo:Travel:5678',
          currency: 'INR',
          balance_scaled: '0',
          scale: 12,
          last_activity: 20260430,
        }}
        names={{}}
        trend={{ currency: 'INR', months: [8000, 6000, 11000, 7000, 9000, 4000] }}
        meta={{
          reward_label: 'Sample Rewards',
          reward_account: 'Assets:Rewards:Points:Sample',
          reward_balance: 75200,
          reward_pending: 1200,
          reward_unit: 'pts',
        }}
      />
    </div>
  ),
}
