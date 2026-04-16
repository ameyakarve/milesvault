import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { resetAutocompleteCache } from './beancount-autocomplete'
import { TxnNewCard } from './txn-new-card'
import { defaultTxnRoutes, installFakeFetch, type Routes } from './story-fetch'

const HOME_COMMODITIES: Record<string, string> = {
  'Liabilities:CC:HDFC:Infinia': 'INR',
  'Liabilities:CC:Axis:Magnus': 'INR',
  'Assets:Cash': 'INR',
}

const REWARD_OPENS = `2020-01-01 open Assets:Rewards:HDFC:SmartBuy SMARTBUY_POINTS
2020-01-01 open Income:Rewards:HDFC:Earned SMARTBUY_POINTS

`

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

export const CCSpend: Story = {
  args: {
    initialText: `2026-04-14 * "Amudham" "Team dinner" ^dinner-amudham
  Expenses:Food:Dining           1500 INR
  Liabilities:CC:HDFC:Infinia   -1500 INR`,
  },
}

export const CCSpendReward: Story = {
  args: {
    initialText: `${REWARD_OPENS}2026-04-14 * "Amudham" "Dinner + 50 SmartBuy points" ^dinner-amudham
  Expenses:Food:Dining              1500 INR
  Liabilities:CC:HDFC:Infinia      -1500 INR
  Assets:Rewards:HDFC:SmartBuy        50 SMARTBUY_POINTS
  Income:Rewards:HDFC:Earned         -50 SMARTBUY_POINTS`,
  },
}

export const CCSpendDiscount: Story = {
  args: {
    initialText: `2026-04-14 * "Amudham" "Dinner — Rs. 100 off" ^dinner-amudham
  Expenses:Food:Dining           1500 INR
  Liabilities:CC:HDFC:Infinia   -1400 INR
  Equity:Discount               -100 INR`,
  },
}

export const CCSpendCashback: Story = {
  args: {
    initialText: `2026-04-14 * "Amudham" "Dinner — 5% cashback" ^dinner-amudham
  Expenses:Food:Dining                    1500 INR
  Liabilities:CC:HDFC:Infinia            -1500 INR
  Assets:Cashback:Pending:HDFC:Infinia      75 INR
  Income:Cashback:HDFC:Infinia             -75 INR`,
  },
}

export const CCSpendKitchenSink: Story = {
  args: {
    initialText: `${REWARD_OPENS}2026-04-14 * "Amudham" "Dinner — discount + cashback + points" ^dinner-amudham
  Expenses:Food:Dining                    1500 INR
  Liabilities:CC:HDFC:Infinia            -1400 INR
  Equity:Discount                         -100 INR
  Assets:Cashback:Pending:HDFC:Infinia      70 INR
  Income:Cashback:HDFC:Infinia             -70 INR
  Assets:Rewards:HDFC:SmartBuy              50 SMARTBUY_POINTS
  Income:Rewards:HDFC:Earned               -50 SMARTBUY_POINTS`,
  },
}

export const CashSpend: Story = {
  args: {
    initialText: `2026-04-13 * "Chai Point" "Morning coffee" ^coffee-2026-04-13
  Expenses:Food:Coffee      120 INR
  Assets:Cash              -120 INR`,
  },
}

export const SplitExpense: Story = {
  args: {
    initialText: `2026-04-10 * "Nature's Basket" "Groceries + household" ^grocery-2026-04-10
  Expenses:Food:Groceries            3200 INR
  Expenses:Household:Supplies         800 INR
  Liabilities:CC:Axis:Magnus        -4000 INR`,
  },
}

export const PendingTxn: Story = {
  args: {
    initialText: `2026-04-15 ! "Taj Goa" "Hotel — awaiting folio" ^hotel-goa-trip
  Expenses:Travel:Hotel            18000 INR
  Liabilities:CC:HDFC:Infinia     -18000 INR`,
  },
}

export const MultipleTxns: Story = {
  args: {
    initialText: `2026-04-14 * "Amudham" "Dinner" ^dinner-amudham
  Expenses:Food:Dining           1500 INR
  Liabilities:CC:HDFC:Infinia   -1500 INR

2026-04-13 * "Chai Point" "Coffee" ^coffee-2026-04-13
  Expenses:Food:Coffee      120 INR
  Assets:Cash              -120 INR`,
  },
}

export const OrphanCashbackIncome: Story = {
  args: {
    initialText: `2026-04-14 * "Amudham" "Dinner — cashback missing reverse" ^dinner-amudham
  Expenses:Food:Dining           1500 INR
  Liabilities:CC:HDFC:Infinia   -1425 INR
  Income:Cashback:HDFC:Infinia    -75 INR`,
  },
}

export const OrphanRewardAsset: Story = {
  args: {
    initialText: `${REWARD_OPENS}2026-04-14 * "Amudham" "Dinner — reward missing income" ^dinner-amudham
  Expenses:Food:Dining              1500 INR
  Liabilities:CC:HDFC:Infinia      -1500 INR
  Assets:Rewards:HDFC:SmartBuy        50 SMARTBUY_POINTS
  Equity:Adjustment                  -50 SMARTBUY_POINTS`,
  },
}

export const HotelWithRedemption: Story = {
  args: {
    initialText: `${REWARD_OPENS}2026-04-15 * "Accor" "Hotel stay — points + card" ^hotel-accor
  Expenses:Travel:Hotel                10000 INR
  Assets:Rewards:HDFC:SmartBuy         -4000 SMARTBUY_POINTS @@ 8000 INR
  Liabilities:CC:HDFC:Infinia          -2000 INR`,
  },
}

export const OrphanRedemptionNoPrice: Story = {
  args: {
    initialText: `${REWARD_OPENS}2026-04-15 * "Accor" "Hotel — redemption missing price" ^hotel-accor
  Expenses:Travel:Hotel            10000 SMARTBUY_POINTS
  Assets:Rewards:HDFC:SmartBuy    -10000 SMARTBUY_POINTS`,
  },
}

export const PointsTransferBasic: Story = {
  args: {
    initialText: `2026-04-16 * "HDFC" "SmartBuy → Finnair @ 2:1" ^smartbuy-to-finnair
  Assets:Rewards:HDFC:SmartBuy    -4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair           2000 FINNAIR_POINTS @@ 4000 SMARTBUY_POINTS`,
  },
}

export const TransferBasic: Story = {
  args: {
    initialText: `2026-04-16 * "Self" "Move cash to checking" ^savings-sweep
  Assets:Bank:Savings    -10000 INR
  Assets:Bank:Checking    10000 INR`,
  },
}

export const CCPayment: Story = {
  args: {
    initialText: `2026-04-16 * "HDFC" "April statement payment" ^cc-pay-april
  Assets:Bank:Checking          -18000 INR
  Liabilities:CC:HDFC:Infinia    18000 INR`,
  },
}

export const WalletTopUp: Story = {
  args: {
    initialText: `2026-04-16 * "Paytm" "Load wallet from HDFC" ^paytm-load
  Liabilities:CC:HDFC:Infinia  -1000 INR
  Assets:Wallet:Paytm           1000 INR`,
  },
}

export const GiftCardTopUp: Story = {
  args: {
    initialText: `2026-04-16 * "Amazon" "Gift card reload" ^amzn-gc
  Assets:Bank:Checking       -500 INR
  Assets:GiftCard:Amazon      500 INR`,
  },
}

export const CCRefund: Story = {
  args: {
    initialText: `2026-04-16 * "Myntra" "Returned shirt — refund to card" ^myntra-return
  Expenses:Shopping:Clothing     -2500 INR
  Liabilities:CC:HDFC:Infinia     2500 INR`,
  },
}

export const AnnualFee: Story = {
  args: {
    initialText: `2026-04-16 * "HDFC" "Infinia annual fee" ^infinia-fee-2026
  Expenses:Fees:Annual:HDFC:Infinia    12500 INR
  Liabilities:CC:HDFC:Infinia         -12500 INR`,
  },
}

export const ServerRejects: Story = {
  args: CCSpend.args,
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
