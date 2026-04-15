import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { TxnEditCard } from './txn-edit-card'
import { defaultTxnRoutes, installFakeFetch, type Routes } from './story-fetch'

const meta: Meta<typeof TxnEditCard> = {
  title: 'Chat/TxnEditCard',
  component: TxnEditCard,
  decorators: [
    (Story, context) => {
      const routes = (context.parameters.routes as Routes) ?? defaultTxnRoutes
      installFakeFetch(routes)
      return (
        <div style={{ maxWidth: 680 }}>
          <Story />
        </div>
      )
    },
  ],
}

export default meta
type Story = StoryObj<typeof TxnEditCard>

export const DraftSimple: Story = {
  args: {
    initialDraft: {
      date: '2026-04-14',
      flag: '*',
      payee: 'Someplace',
      narration: 'Dinner',
      postings: [
        { account: 'Expenses:Food:Dining', amount: 1500, commodity: 'INR' },
        { account: 'Liabilities:CC:HDFC:Infinia', amount: -1500, commodity: 'INR' },
      ],
    },
  },
}

export const DraftWithRewards: Story = {
  args: {
    initialDraft: {
      date: '2026-04-14',
      flag: '*',
      payee: 'Someplace',
      narration: 'Dinner with SmartBuy earn',
      postings: [
        { account: 'Expenses:Food:Dining', amount: 1500, commodity: 'INR' },
        { account: 'Liabilities:CC:HDFC:Infinia', amount: -1500, commodity: 'INR' },
        { account: 'Assets:Rewards:HDFC:SmartBuy', amount: 50, commodity: 'SMARTBUY_POINTS' },
        { account: 'Income:Rewards:HDFC:Earned', amount: -50, commodity: 'SMARTBUY_POINTS' },
      ],
    },
  },
}

export const Locked: Story = {
  args: {
    ...DraftSimple.args,
    locked: true,
  },
}

export const ServerRejects: Story = {
  args: DraftSimple.args,
  parameters: {
    routes: {
      ...defaultTxnRoutes,
      'POST /api/beancount/txns': async () => ({
        status: 400,
        body: {
          error: 'Parse error',
          detail: 'Unbalanced transaction: INR sums to 100 (tolerance 0.005)',
        },
        delay: 400,
      }),
    },
  },
}
