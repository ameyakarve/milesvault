import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { Transaction } from '@/durable/ledger-types'
import { TextEditor } from './text-editor'

const now = Date.parse('2026-04-17T10:00:00Z')

function mkTxn(id: number, raw_text: string): Transaction {
  return { id, raw_text, created_at: now, updated_at: now }
}

const FIXTURES: Record<string, Transaction[]> = {
  empty: [],
  small: [
    mkTxn(
      1,
      `2026-04-17 * "Amudham" "coffee, 10% HSBC cashback"
  Liabilities:CreditCards:HSBC:Cashback   -35.00 INR
  Expenses:Food:Coffee                     35.00 INR
  Liabilities:CreditCards:HSBC:Cashback     3.50 INR
  Income:Rewards:Cashback                  -3.50 INR`,
    ),
    mkTxn(
      2,
      `2026-04-16 * "Zomato" "dinner"
  Liabilities:CreditCards:HDFC:Infinia  -1220.00 INR
  Expenses:Food:Restaurant               1220.00 INR`,
    ),
    mkTxn(
      3,
      `2026-04-15 * "HDFC Savings" "ATM withdrawal"
  Assets:Bank:HDFC:Savings   -5000.00 INR
  Assets:Cash                 5000.00 INR`,
    ),
  ],
  atCap: Array.from({ length: 10 }, (_, i) =>
    mkTxn(
      100 + i,
      `2026-04-${String(17 - i).padStart(2, '0')} * "Vendor ${i + 1}" "line item ${i + 1}"
  Liabilities:CreditCards:HDFC:Infinia   -${(100 + i * 15).toFixed(2)} INR
  Expenses:Misc                            ${(100 + i * 15).toFixed(2)} INR`,
    ),
  ),
}

function PaneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen bg-[#FAFAF9] text-[#09090B]">
      <section className="w-1/2 max-w-[960px] h-screen overflow-hidden px-6 py-6 flex flex-col gap-4">
        {children}
      </section>
    </div>
  )
}

const meta: Meta<typeof TextEditor> = {
  title: 'Ledger / TextEditor',
  component: TextEditor,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PaneFrame>
        <Story />
      </PaneFrame>
    ),
  ],
  args: {
    onReload: () => {},
  },
}

export default meta
type Story = StoryObj<typeof TextEditor>

export const Empty: Story = {
  args: { rows: FIXTURES.empty, total: 0 },
}

export const Small: Story = {
  args: { rows: FIXTURES.small, total: FIXTURES.small.length },
}

export const AtCap: Story = {
  args: { rows: FIXTURES.atCap, total: FIXTURES.atCap.length },
}

export const OverCap: Story = {
  args: { rows: FIXTURES.atCap, total: 42 },
  parameters: {
    docs: {
      description: {
        story: 'Renders the narrow-the-search guardrail when total exceeds MAX_BLOCKS (10).',
      },
    },
  },
}
