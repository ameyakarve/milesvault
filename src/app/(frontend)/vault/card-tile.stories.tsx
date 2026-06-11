import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CreditCardCard } from './vault-view'

const meta: Meta = { title: 'Vault/CardTile' }
export default meta

export const Default: StoryObj = {
  render: () => (
    <div className="max-w-md space-y-3 bg-background p-6">
      <CreditCardCard
        row={{
          account: 'Liabilities:CreditCards:Axis:MagnusBurgundy:3467',
          currency: 'INR',
          balance_scaled: '16754090000000000',
          scale: 12,
          last_activity: 20260518,
        }}
        names={{}}
        spend={[{ currency: 'INR', total: 87398 }]}
      />
      <CreditCardCard
        row={{
          account: 'Liabilities:CreditCards:HDFC:Infinia:1784',
          currency: 'INR',
          balance_scaled: '0',
          scale: 12,
          last_activity: 20260518,
        }}
        names={{}}
        spend={[]}
      />
    </div>
  ),
}
