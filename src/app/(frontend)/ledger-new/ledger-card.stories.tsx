import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Wallet } from 'lucide-react'
import { EntryCard, type CardPreset } from './ledger-card'

const PRESET: CardPreset = {
  glyph: Wallet,
  color: 'amber',
  narration: '',
  account: '',
  rewards: { current: '—' },
  amount: '',
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
          'Txn has 3 postings, so subtext derivation bails (strict 2-posting rule). Card falls back to the preset `account` string.',
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
