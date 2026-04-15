import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { resetAutocompleteCache } from './beancount-autocomplete'
import { TxnNewCard } from './txn-new-card'
import { defaultTxnRoutes, installFakeFetch, type Routes } from './story-fetch'

const HOME_COMMODITIES: Record<string, string> = {
  'Liabilities:CC:HDFC:Infinia': 'INR',
  'Liabilities:CC:Axis:Magnus': 'INR',
  'Assets:Bank:HDFC:Checking': 'INR',
  'Assets:Cash': 'INR',
}

const meta: Meta<typeof TxnNewCard> = {
  title: 'Chat/TxnNewCard',
  component: TxnNewCard,
  args: {
    homeCommodityByAccount: HOME_COMMODITIES,
  },
  decorators: [
    (Story, context) => {
      const routes = (context.parameters.routes as Routes) ?? defaultTxnRoutes
      installFakeFetch(routes)
      resetAutocompleteCache()
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
    initialText: `; DATE (*=cleared|!=pending) "PAYEE" "NOTES" ^link   — postings sum to 0
2026-04-15 * "Amudham" "Team dinner" ^dinner-amudham
  Expenses:Food:Dining           1500 INR
  Liabilities:CC:HDFC:Infinia   -1500 INR`,
  },
}

export const SimpleCCCharge: Story = {
  args: {
    initialText: `2026-04-14 * "Amudham" "Team dinner" ^dinner-amudham
  Expenses:Food:Dining           1500 INR
  Liabilities:CC:HDFC:Infinia   -1500 INR`,
  },
}

export const CCSpendWithReward: Story = {
  args: {
    initialText: `2020-01-01 open Assets:Rewards:HDFC:SmartBuy SMARTBUY_POINTS
2020-01-01 open Income:Rewards:HDFC:Earned SMARTBUY_POINTS

2026-04-14 * "Amudham" "Dinner with SmartBuy earn" ^dinner-amudham
  Expenses:Food:Dining              1500 INR
  Liabilities:CC:HDFC:Infinia      -1500 INR
  Assets:Rewards:HDFC:SmartBuy        50 SMARTBUY_POINTS
  Income:Rewards:HDFC:Earned         -50 SMARTBUY_POINTS`,
  },
}

export const CCSpendWithDiscount: Story = {
  args: {
    initialText: `2026-04-14 * "Amudham" "Dinner with Rs. 100 discount" ^dinner-amudham
  Expenses:Food:Dining              1500 INR
  Liabilities:CC:HDFC:Infinia      -1400 INR
  Equity:Discount                   -100 INR`,
  },
}

export const CCSpendWithCashback: Story = {
  args: {
    initialText: `2026-04-14 * "Amudham" "Dinner with 5% cashback" ^dinner-amudham
  Expenses:Food:Dining                    1500 INR
  Liabilities:CC:HDFC:Infinia            -1500 INR
  Assets:Cashback:Pending:HDFC:Infinia      75 INR
  Income:Cashback:HDFC:Infinia             -75 INR`,
  },
}

export const CashPurchase: Story = {
  args: {
    initialText: `2026-04-13 * "Chai Point" "Morning coffee" ^coffee-2026-04-13
  Expenses:Food:Coffee      120 INR
  Assets:Cash              -120 INR`,
  },
}

export const SplitGroceries: Story = {
  args: {
    initialText: `2026-04-10 * "Nature's Basket" "Weekly groceries + household" ^grocery-2026-04-10
  Expenses:Food:Groceries            3200 INR
  Expenses:Household:Supplies         800 INR
  Liabilities:CC:Axis:Magnus        -4000 INR`,
  },
}

export const RentPayment: Story = {
  args: {
    initialText: `2026-04-01 * "Landlord" "April rent" ^rent-2026-04
  Expenses:Rent                  45000 INR
  Assets:Bank:HDFC:Checking     -45000 INR`,
  },
}

export const PendingTransaction: Story = {
  args: {
    initialText: `2026-04-15 ! "Taj Goa" "Hotel — awaiting folio" ^hotel-goa-trip
  Expenses:Travel:Hotel            18000 INR
  Liabilities:CC:HDFC:Infinia     -18000 INR`,
  },
}

export const MultipleTransactions: Story = {
  args: {
    initialText: `2026-04-14 * "Amudham" "Dinner" ^dinner-amudham
  Expenses:Food:Dining           1500 INR
  Liabilities:CC:HDFC:Infinia   -1500 INR

2026-04-13 * "Chai Point" "Coffee" ^coffee-2026-04-13
  Expenses:Food:Coffee      120 INR
  Assets:Cash              -120 INR`,
  },
}

export const ServerRejects: Story = {
  args: SimpleCCCharge.args,
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
