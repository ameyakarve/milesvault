import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { Transaction } from '@/durable/ledger-types'
import { LedgerNewView } from './ledger-new-view'

const NOW = Date.parse('2026-04-25T14:32:00Z')

const TXNS: Transaction[] = [
  {
    id: 1,
    created_at: NOW,
    updated_at: NOW,
    raw_text: `2026-04-22 * "Swiggy" "Biryani + kebabs" #food
  Expenses:Food:Delivery               1284.00 INR
  Liabilities:CC:HDFC:Infinia         -1284.00 INR
`,
  },
  {
    id: 2,
    created_at: NOW,
    updated_at: NOW,
    raw_text: `2026-04-22 * "Blue Bottle Coffee" "" #lifestyle
  Expenses:Food:Coffee                    5.40 INR
  Assets:Wallet:Cash                     -5.40 INR
`,
  },
  {
    id: 3,
    created_at: NOW,
    updated_at: NOW,
    raw_text: `2026-04-20 * "HDFC ATM" "Cash withdrawal"
  Expenses:Cash:Withdrawal             3000.00 INR
  Assets:Bank:HDFC:Savings            -3000.00 INR
`,
  },
]

const TOTAL = 148

if (typeof window !== 'undefined') {
  const w = window as Window & { __mvFetchMockInstalled?: boolean }
  if (!w.__mvFetchMockInstalled) {
    w.__mvFetchMockInstalled = true
    const original = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url.startsWith('/api/ledger/transactions') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ rows: TXNS, total: TOTAL }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.startsWith('/api/ledger/transactions/buffer')) {
        return new Response(JSON.stringify({ transactions: TXNS }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return original(input, init)
    }
  }
}

function MockedShell() {
  return <LedgerNewView email="ameya.karve@gmail.com" />
}

const meta: Meta<typeof MockedShell> = {
  title: 'LedgerNew / TwoPane',
  component: MockedShell,
  parameters: { layout: 'fullscreen' },
}
export default meta

type Story = StoryObj<typeof MockedShell>

export const Default: Story = {}

export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
}
