import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { LedgerEditor } from './ledger-editor'
import type { AccountCompleter, Validator } from './editor'

const BASELINE = `2026-04-17 * "Amudham" "coffee"
  Liabilities:CC:HSBC   -35.00 INR
  Expenses:Food:Coffee             35.00 INR

2026-04-16 * "Zomato" "dinner"
  Liabilities:CC:HDFC  -1220.00 INR
  Expenses:Food:Restaurant       1220.00 INR

2026-04-15 * "HDFC Savings" "ATM withdrawal"
  Assets:Bank:HDFC:Savings   -5000.00 INR
  Assets:Cash                 5000.00 INR
`

const DIRTY = `2026-04-17 * "Amudham" "coffee + tip"
  Liabilities:CC:HSBC   -40.00 INR
  Expenses:Food:Coffee             40.00 INR

2026-04-16 * "Zomato" "dinner"
  Liabilities:CC:HDFC  -1220.00 INR
  Expenses:Food:Restaurant       1220.00 INR

2026-04-15 * "HDFC Savings" "ATM withdrawal"
  Assets:Bank:HDFC:Savings   -5000.00 INR
  Assets:Cash                 5000.00 INR

2026-04-14 * "New txn" "created after baseline"
  Liabilities:CC:HDFC   -99.00 INR
  Expenses:Misc                    99.00 INR
`

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen bg-white text-navy-700 font-sans">
      <section className="w-[640px] h-screen flex flex-col border-r border-slate-200">
        {children}
      </section>
    </div>
  )
}

function Host({
  initialValue,
  baseline,
  validators,
  completeAccount,
}: {
  initialValue: string
  baseline?: string
  validators?: readonly Validator[]
  completeAccount?: AccountCompleter
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <LedgerEditor
      className="h-full"
      value={value}
      baseline={baseline}
      validators={validators}
      completeAccount={completeAccount}
      onChange={setValue}
    />
  )
}

const meta: Meta<typeof Host> = {
  title: 'LedgerNew / Editor',
  component: Host,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Frame>
        <Story />
      </Frame>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof Host>

export const Empty: Story = {
  args: { initialValue: '' },
}

export const Clean: Story = {
  args: { initialValue: BASELINE, baseline: BASELINE },
  parameters: {
    docs: {
      description: {
        story: 'Buffer matches baseline. No created/updated highlights, no diagnostics.',
      },
    },
  },
}

export const Dirty: Story = {
  args: { initialValue: DIRTY, baseline: BASELINE },
  parameters: {
    docs: {
      description: {
        story:
          'Buffer diverges from baseline. First txn shows updated-line background + word-added marks; last is fully created.',
      },
    },
  },
}

const BROKEN = `2026-04-17 * "Amudham" "coffee"
  Liabilities:CC:HSBC   -35.00 INR
  Expenses:Food:Coffee             35.00 INR

2026-04-16 & "Zomato" "dinner"
  Liabilities:CC:HDFC  -1220.00 INR
  Expenses:Food:Restaurant       1220.00 INR

2026-04-15 * "HDFC Savings" "ATM withdrawal
  Assets:Bank:HDFC:Savings   -5000.00 INR
  Assets:Cash                 5000.00 INR
`

export const WithParseErrors: Story = {
  args: { initialValue: BROKEN },
  parameters: {
    docs: {
      description: {
        story:
          'Second txn uses invalid flag "&"; third txn has unterminated narration string. Lezer marks error spans; CodeMirror underlines them and shows gutter markers.',
      },
    },
  },
}

const UNBALANCED = `2026-04-17 * "Amudham" "coffee"
  Liabilities:CC:HSBC   -35.00 INR
  Expenses:Food:Coffee             30.00 INR
`

export const WithUnbalancedTxn: Story = {
  args: { initialValue: UNBALANCED },
  parameters: {
    docs: {
      description: {
        story:
          'Postings sum to -5 INR. Block-level balance validator flags the header with a red underline + gutter marker.',
      },
    },
  },
}

const MISSING_PAYEE = `2026-04-17 * "coffee"
  Liabilities:CC:HSBC   -35.00 INR
  Expenses:Food:Coffee   35.00 INR
`

export const WithMissingPayee: Story = {
  args: { initialValue: MISSING_PAYEE },
  parameters: {
    docs: {
      description: {
        story:
          'Header has only one string (= narration), no payee. payee-present validator underlines the header.',
      },
    },
  },
}

const ELIDED_AMOUNT = `2026-04-17 * "Amudham" "coffee"
  Liabilities:CC:HSBC   -35.00 INR
  Expenses:Food:Coffee
`

export const WithElidedAmount: Story = {
  args: { initialValue: ELIDED_AMOUNT },
  parameters: {
    docs: {
      description: {
        story:
          'One posting has no amount (elided). amount-required validator flags the posting line.',
      },
    },
  },
}

const CASHBACK_POSITIVE = `2026-04-17 * "HDFC" "April statement cashback"
  Liabilities:CC:HDFC          -250.00 INR
  Income:Void       250.00 INR
`

export const WithPositiveCashback: Story = {
  args: { initialValue: CASHBACK_POSITIVE },
  parameters: {
    docs: {
      description: {
        story:
          'Income:Void posting is positive. cashback-sign validator underlines the amount.',
      },
    },
  },
}

const CASHBACK_NO_MATCH = `2026-04-17 * "HDFC" "cashback split oddly"
  Liabilities:CC:HDFC          -200.00 INR
  Income:Void      -250.00 INR
  Expenses:Food:Coffee          450.00 INR
`

export const WithCashbackNoMatchingPosting: Story = {
  args: { initialValue: CASHBACK_NO_MATCH },
  parameters: {
    docs: {
      description: {
        story:
          'Cashback is -250 INR but no other posting equals +250 INR. cashback-counterpart validator flags the cashback posting.',
      },
    },
  },
}

const CASHBACK_NO_PAYMENT = `2026-04-17 * "Redeem" "cashback fully offsets expense"
  Expenses:Food:Coffee     100.00 INR
  Income:Void -100.00 INR
`

export const WithCashbackButNoPayment: Story = {
  args: { initialValue: CASHBACK_NO_PAYMENT },
  parameters: {
    docs: {
      description: {
        story:
          'Txn has only Expenses + `Income:Void` postings — no real payment leg. cashback-needs-payment validator flags the header.',
      },
    },
  },
}

const COMPLETION_SEED = `2026-04-17 * "Amudham" "coffee"
  Liabilities:CC:HSBC   -35.00 INR
  Expenses:`

export const WithAccountAutocomplete: Story = {
  args: { initialValue: COMPLETION_SEED },
  parameters: {
    docs: {
      description: {
        story:
          'Caret parked after `Expenses:`. Typing `:` after any capitalized segment triggers the built-in account completer (prefix match over default account list).',
      },
    },
  },
}

export const WithNoopValidator: Story = {
  args: {
    initialValue: BASELINE,
    baseline: BASELINE,
    validators: [() => []],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Validator wiring is live but returns no diagnostics. Replace the no-op in `validators` with real validators (e.g. `(doc) => Diagnostic[]`) to see lint gutter + underlines appear.',
      },
    },
  },
}
