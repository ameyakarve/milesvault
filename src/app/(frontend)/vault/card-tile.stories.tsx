import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CreditCardCard } from './vault-view'

const meta: Meta = { title: 'Vault/CardTile' }
export default meta

// Synthetic fixtures — public bank names only, invented round numbers, no real
// card data. Exercises the full-color card art + marks across issuers.
const CARDS: Array<{
  account: string
  bal: string
  months: number[]
  reward: { label: string; balance: number | null; pending: number | null; unit: string }
}> = [
  {
    account: 'Liabilities:CreditCards:HDFC:Infinia:1001',
    bal: '-82500000000000000',
    months: [40000, 52000, 38000, 61000, 44000, 70000],
    reward: { label: 'Reward Points', balance: 64300, pending: 1200, unit: 'pts' },
  },
  {
    account: 'Liabilities:CreditCards:HSBC:LivePlus:1002',
    bal: '12340000000000000',
    months: [15000, 12000, 13000, 9000, 11000, 6000],
    reward: { label: 'Cashback', balance: 450, pending: 120, unit: 'INR' },
  },
  {
    account: 'Liabilities:CreditCards:Axis:Magnus:1003',
    bal: '-23400000000000000',
    months: [22000, 18000, 30000, 25000, 41000, 33000],
    reward: { label: 'Edge Rewards', balance: 118500, pending: null, unit: 'pts' },
  },
  {
    account: 'Liabilities:CreditCards:Amex:Platinum:1004',
    bal: '-45000000000000000',
    months: [60000, 55000, 70000, 48000, 80000, 90000],
    reward: { label: 'Membership Rewards', balance: 240000, pending: 5000, unit: 'pts' },
  },
  {
    account: 'Liabilities:CreditCards:ICICI:Sapphiro:1005',
    bal: '-7800000000000000',
    months: [11000, 9000, 13000, 7000, 10000, 12000],
    reward: { label: 'Reward Points', balance: 14200, pending: null, unit: 'pts' },
  },
  {
    account: 'Liabilities:CreditCards:SBI:Prime:1006',
    bal: '-3200000000000000',
    months: [5000, 6000, 4000, 8000, 9000, 7000],
    reward: { label: 'Reward Points', balance: 9100, pending: null, unit: 'pts' },
  },
  {
    account: 'Liabilities:CreditCards:Citi:Rewards:1007',
    bal: '0',
    months: [3000, 4000, 2000, 5000, 3000, 4000],
    reward: { label: 'Reward Points', balance: 5600, pending: null, unit: 'pts' },
  },
  {
    account: 'Liabilities:CreditCards:Kiwi:Neo:1008',
    bal: '-1500000000000000',
    months: [2000, 3000, 1000, 4000, 2000, 3000],
    reward: { label: 'Cashback', balance: 90, pending: null, unit: 'INR' },
  },
]

export const Default: StoryObj = {
  render: () => (
    <div className="grid max-w-5xl grid-cols-1 gap-3 bg-background p-6 sm:grid-cols-2 lg:grid-cols-3">
      {CARDS.map((c) => (
        <CreditCardCard
          key={c.account}
          row={{
            account: c.account,
            currency: 'INR',
            balance_scaled: c.bal,
            scale: 12,
            last_activity: 20260430,
          }}
          names={{}}
          trend={{ currency: 'INR', months: c.months }}
          meta={{
            reward_label: c.reward.label,
            reward_account: 'Assets:Rewards:Points:Demo',
            reward_balance: c.reward.balance,
            reward_pending: c.reward.pending,
            reward_unit: c.reward.unit,
          }}
        />
      ))}
    </div>
  ),
}
