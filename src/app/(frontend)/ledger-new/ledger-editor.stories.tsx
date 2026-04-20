import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { LedgerEditor } from './ledger-editor'
import type { Validator } from './editor'

const BASELINE = `2026-04-17 * "Amudham" "coffee"
  Liabilities:CreditCards:HSBC   -35.00 INR
  Expenses:Food:Coffee             35.00 INR

2026-04-16 * "Zomato" "dinner"
  Liabilities:CreditCards:HDFC  -1220.00 INR
  Expenses:Food:Restaurant       1220.00 INR

2026-04-15 * "HDFC Savings" "ATM withdrawal"
  Assets:Bank:HDFC:Savings   -5000.00 INR
  Assets:Cash                 5000.00 INR
`

const DIRTY = `2026-04-17 * "Amudham" "coffee + tip"
  Liabilities:CreditCards:HSBC   -40.00 INR
  Expenses:Food:Coffee             40.00 INR

2026-04-16 * "Zomato" "dinner"
  Liabilities:CreditCards:HDFC  -1220.00 INR
  Expenses:Food:Restaurant       1220.00 INR

2026-04-15 * "HDFC Savings" "ATM withdrawal"
  Assets:Bank:HDFC:Savings   -5000.00 INR
  Assets:Cash                 5000.00 INR

2026-04-14 * "New txn" "created after baseline"
  Liabilities:CreditCards:HDFC   -99.00 INR
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
}: {
  initialValue: string
  baseline?: string
  validators?: readonly Validator[]
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <LedgerEditor
      className="h-full"
      value={value}
      baseline={baseline}
      validators={validators}
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
