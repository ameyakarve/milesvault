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
        spend={[{ currency: 'INR', total: 50000 }]}
        meta={{
          network: 'Visa',
          reward_kind: 'cashback',
          pool_name: null,
          receivable_balance: 450,
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
        spend={[]}
        meta={{
          network: 'Mastercard',
          reward_kind: 'points',
          pool_name: 'Sample Rewards',
          receivable_balance: null,
        }}
      />
    </div>
  ),
}
