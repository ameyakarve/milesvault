import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { TxnNewCard } from './txn-new-card'
import { defaultTxnRoutes, installFakeFetch, type Routes } from './story-fetch'

const meta: Meta<typeof TxnNewCard> = {
  title: 'Chat/TxnNewCard',
  component: TxnNewCard,
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
type Story = StoryObj<typeof TxnNewCard>

export const Empty: Story = {
  args: {},
}

export const Prefilled: Story = {
  args: {
    initialText: `2026-04-15 * "Someplace" "Dinner"
  Expenses:Food:Dining           1500 INR
  Liabilities:CC:HDFC:Infinia   -1500 INR`,
  },
}

export const ServerRejects: Story = {
  args: Prefilled.args,
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
