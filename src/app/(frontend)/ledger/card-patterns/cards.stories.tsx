import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TxnCard } from './index'

const meta: Meta<typeof TxnCard> = {
  title: 'Ledger / Card Patterns',
  component: TxnCard,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-[640px] bg-[#FAFAF9] py-10">
        <div className="bg-white border-y border-zinc-200">
          <Story />
        </div>
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof TxnCard>

export const SimpleExpense: Story = {
  args: {
    raw: `2026-04-17 * "Amudham" "coffee"
  Liabilities:CC:HSBC   -35.00 INR
  Expenses:Food:Coffee             35.00 INR`,
  },
}

export const CashbackExpense: Story = {
  args: {
    raw: `2026-04-17 * "Amudham" "coffee"
  Liabilities:CC:HSBC:Cashback   -35.00 INR
  Expenses:Food:Coffee                     35.00 INR
  Liabilities:CC:HSBC:Cashback     3.50 INR
  Income:Rewards:Cashback                  -3.50 INR`,
  },
}

export const GroceryRow: Story = {
  args: {
    raw: `2026-04-16 * "Swiggy Instamart" "groceries"
  Liabilities:CC:HDFC:Infinia   -842.00 INR
  Expenses:Food:Groceries                  842.00 INR`,
  },
}

export const PendingRow: Story = {
  args: {
    raw: `2026-04-15 ! "Airtel" "broadband"
  Assets:Bank:HDFC:Savings   -1499.00 INR
  Expenses:Bills:Internet     1499.00 INR`,
  },
}

export const LargeAmount: Story = {
  args: {
    raw: `2026-04-10 * "Taj Mahal Hotel" "Mumbai stay"
  Liabilities:CC:HDFC:Infinia   -125000.00 INR
  Expenses:Travel:Hotels                   125000.00 INR`,
  },
}

export const NoCategoryMatch: Story = {
  args: {
    raw: `2026-04-14 * "Mystery" "unusual"
  Liabilities:CC:HDFC  -100.00 INR
  Expenses:WeirdThing            100.00 INR`,
  },
}

export const FallbackComplex: Story = {
  args: {
    raw: `2026-04-12 * "Split dinner" "three way"
  Liabilities:CC:HDFC  -3000.00 INR
  Expenses:Food:Restaurant       1000.00 INR
  Expenses:Food:Restaurant       1000.00 INR
  Expenses:Food:Restaurant       1000.00 INR`,
  },
}

export const FallbackRaw: Story = {
  args: {
    raw: `this is not valid beancount at all`,
  },
}
