import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Wallet } from 'lucide-react'
import { EntryCard, type CardPreset } from './ledger-card'

const PRESET: CardPreset = {
  glyph: Wallet,
  color: 'amber',
  narration: '',
  account: '—',
  rewards: { current: '—' },
  amount: '—',
}

const meta: Meta<typeof EntryCard> = {
  title: 'LedgerNew / Card',
  component: EntryCard,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="bg-white text-navy-700 font-sans">
        <div className="w-[640px] border-r border-slate-200">
          <Story />
        </div>
      </div>
    ),
  ],
  args: { preset: PRESET, active: false },
}

export default meta
type Story = StoryObj<typeof EntryCard>

export const CreditCardBankOnly: Story = {
  args: {
    text: `2026-04-17 * "Amudham" "coffee"
  Liabilities:CC:HSBC       -35.00 INR
  Expenses:Food:Coffee       35.00 INR`,
  },
  parameters: {
    docs: {
      description: {
        story:
          '`Liabilities:CC:HSBC` (bank only) → subtext "HSBC Card". Payee + icon derived from the parsed txn.',
      },
    },
  },
}

export const CreditCardBankAndProduct: Story = {
  args: {
    text: `2026-04-17 * "Amazon" "monitor"
  Liabilities:CC:HDFC:Infinia   -4500.00 INR
  Expenses:Shopping:Electronics  4500.00 INR`,
  },
  parameters: {
    docs: {
      description: {
        story: '`Liabilities:CC:HDFC:Infinia` → subtext "HDFC Infinia Card".',
      },
    },
  },
}

export const BankAccount: Story = {
  args: {
    text: `2026-04-01 * "Landlord" "april rent"
  Assets:Bank:HDFC:Savings   -45000.00 INR
  Expenses:Housing:Rent       45000.00 INR`,
  },
  parameters: {
    docs: {
      description: {
        story: '`Assets:Bank:HDFC:Savings` → subtext "HDFC Savings".',
      },
    },
  },
}

export const Cash: Story = {
  args: {
    text: `2026-04-17 * "Amudham" "coffee"
  Assets:Cash            -35.00 INR
  Expenses:Food:Coffee    35.00 INR`,
  },
  parameters: {
    docs: {
      description: {
        story: '`Assets:Cash` → subtext "Cash". Anything under `Assets:Cash:*` would not match.',
      },
    },
  },
}

export const UnmatchedPaymentFallback: Story = {
  args: {
    text: `2026-04-10 * "HP" "fuel"
  Assets:Loaded:Wallets:Paytm   -500.00 INR
  Expenses:Transport:Fuel        500.00 INR`,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Wallet path is not covered by `paymentMethodDisplay`; subtext falls back to the raw payment-leg account path.',
      },
    },
  },
}

export const MultiExpenseSameCard: Story = {
  args: {
    text: `2026-04-17 * "Amazon" "monitor + cables"
  Expenses:Shopping:Electronics   4500.00 INR
  Expenses:Shopping:Home           600.00 INR
  Liabilities:CC:HDFC:Infinia    -5100.00 INR`,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Multiple `Expenses:*` postings paid with a single card. Amount is the sum (₹5,100.00). Icon is derived from the first expense leg (Electronics).',
      },
    },
  },
}

export const ExpensesWithCashback: Story = {
  args: {
    text: `2026-04-17 * "Zomato" "dinner with 10% back"
  Expenses:Food:Restaurant      1220.00 INR
  Income:Rewards:Cashback       -122.00 INR
  Liabilities:CC:HDFC          -1098.00 INR`,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Expenses + cashback + single payment leg. Amount = expense total (₹1,220.00); rewards cell shows "+₹122" (cashback magnitude, compact); subtext = payment method ("HDFC Card").',
      },
    },
  },
}

export const MultiExpensesAndCashbacks: Story = {
  args: {
    text: `2026-04-17 * "Amazon" "monitor + cables (10% back on each)"
  Expenses:Shopping:Electronics    4500.00 INR
  Expenses:Shopping:Home            600.00 INR
  Income:Rewards:Cashback          -450.00 INR
  Income:Rewards:Cashback           -60.00 INR
  Liabilities:CC:HDFC:Infinia     -4590.00 INR`,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Multiple expenses + multiple cashbacks + single card. Amount = sum of expenses (₹5,100.00); rewards = "+₹510" (sum of cashback magnitudes); subtext = "HDFC Infinia Card". Icon from first expense.',
      },
    },
  },
}

export const MultiLegFallback: Story = {
  args: {
    text: `2026-04-12 * "Zomato" "split dinner"
  Liabilities:CC:HDFC:Infinia   -1250.00 INR
  Expenses:Food:Restaurant        625.00 INR
  Assets:Receivables:Ankit        625.00 INR`,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Txn has 2 non-expense legs (CC + receivable), so derivation bails (rule: at least 1 Expenses leg + exactly 1 non-expense leg). Card falls back to the preset `account` string.',
      },
    },
  },
}

export const ActiveRow: Story = {
  args: {
    active: true,
    text: `2026-04-17 * "Amudham" "coffee"
  Liabilities:CC:HSBC   -35.00 INR
  Expenses:Food:Coffee   35.00 INR`,
  },
  parameters: {
    docs: {
      description: {
        story: 'Active variant: navy rail, slate background, navy day tile.',
      },
    },
  },
}

export const UnparseableFallback: Story = {
  args: {
    text: `2026-04-17 & "broken" "bad flag"
  Liabilities:CC:HSBC   -35.00 INR
  Expenses:Food:Coffee   35.00 INR`,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Parser rejects the txn (invalid flag). `EntryCard` falls back to regex-extracted date + payee and the preset as-is.',
      },
    },
  },
}
