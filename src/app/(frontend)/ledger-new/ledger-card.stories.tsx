import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  Coffee,
  Fuel,
  ShoppingBasket,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import { Card, type CardRow } from './ledger-card'

const BASE: Omit<CardRow, 'payee' | 'subtext' | 'account'> = {
  glyph: UtensilsCrossed,
  color: 'amber',
  narration: '· dinner',
  rewards: { current: '—' },
  amount: '-₹1,220.00',
  month: 'APR',
  day: '17',
}

function row(overrides: Partial<CardRow>): CardRow {
  return {
    ...BASE,
    payee: 'Zomato',
    account: 'Liabilities:CC:HDFC',
    subtext: null,
    ...overrides,
  }
}

const meta: Meta<typeof Card> = {
  title: 'LedgerNew / Card',
  component: Card,
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
  args: { active: false },
}

export default meta
type Story = StoryObj<typeof Card>

export const CreditCardBankOnly: Story = {
  args: {
    row: row({
      payee: 'HSBC online',
      subtext: 'HSBC Card',
      amount: '-₹35.00',
      glyph: Coffee,
      narration: '· coffee',
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          '`Liabilities:CC:HSBC` (bank only) resolves to "HSBC Card" via `paymentMethodDisplay`.',
      },
    },
  },
}

export const CreditCardBankAndProduct: Story = {
  args: {
    row: row({
      payee: 'Amazon',
      subtext: 'HDFC Infinia Card',
      amount: '-₹4,500.00',
      glyph: ShoppingBasket,
      color: 'indigo',
      narration: '· monitor',
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          '`Liabilities:CC:HDFC:Infinia` (bank + product) resolves to "HDFC Infinia Card".',
      },
    },
  },
}

export const BankAccount: Story = {
  args: {
    row: row({
      payee: 'Rent',
      subtext: 'HDFC Savings',
      amount: '-₹45,000.00',
      glyph: Wallet,
      color: 'slate',
      narration: '· april',
    }),
  },
  parameters: {
    docs: {
      description: {
        story: '`Assets:Bank:HDFC:Savings` resolves to "HDFC Savings".',
      },
    },
  },
}

export const Cash: Story = {
  args: {
    row: row({
      payee: 'Amudham',
      subtext: 'Cash',
      amount: '-₹35.00',
      glyph: Coffee,
      narration: '· coffee',
    }),
  },
  parameters: {
    docs: {
      description: {
        story: '`Assets:Cash` resolves to "Cash". Anything under `Assets:Cash:*` would not.',
      },
    },
  },
}

export const UnmatchedPaymentFallback: Story = {
  args: {
    row: row({
      payee: 'Paytm reload',
      account: 'Assets:Loaded:Wallets:Paytm',
      subtext: 'Assets:Loaded:Wallets:Paytm',
      amount: '-₹500.00',
      glyph: Fuel,
      color: 'sky',
      narration: '· fuel',
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shape not covered by `paymentMethodDisplay` (wallet): view falls back to the raw payment-leg account path as subtext.',
      },
    },
  },
}

export const MultiLegFallback: Story = {
  args: {
    row: row({
      payee: 'Split dinner',
      subtext: null,
      account: 'Liabilities:CC:HDFC:Infinia',
      amount: '-₹1,250.00',
      narration: '· ankit + me',
      pill: { label: 'split', kind: 'split' },
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Txn has 3+ postings, so the subtext derivation bails. Card renders the preset `account` as subtext (existing pre-feature behavior).',
      },
    },
  },
}

export const ActiveRow: Story = {
  args: {
    active: true,
    row: row({
      payee: 'Amudham',
      subtext: 'HSBC Card',
      amount: '-₹35.00',
      glyph: Coffee,
      narration: '· coffee',
    }),
  },
  parameters: {
    docs: {
      description: {
        story: 'Active variant: navy rail, slate background, navy day tile.',
      },
    },
  },
}
