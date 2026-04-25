import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { Transaction } from '@/durable/ledger-types'
import { LedgerView } from './ledger-view'

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
    raw_text: `2026-04-20 * "HDFC ATM" "Cash withdrawal"
  Expenses:Cash:Withdrawal             3000.00 INR
  Assets:Bank:HDFC:Savings            -3000.00 INR
`,
  },
  {
    id: 3,
    created_at: NOW,
    updated_at: NOW,
    raw_text: `2026-04-20 * "Marriott Bonvoy" "3 nights, Singapore" #travel
  Expenses:Travel:Hotel                 612.00 USD
  Liabilities:CC:HDFC:Regalia        -51224.40 INR @@ 612.40 USD
`,
  },
  {
    id: 4,
    created_at: NOW,
    updated_at: NOW,
    raw_text: `2026-04-18 * "Marriott Bonvoy" "tier-elite bonus" #reward-accrual
  Assets:Rewards:Points:Avios          1836.00 AVIOS
  Expenses:Void                       -1836.00 AVIOS
`,
  },
  {
    id: 5,
    created_at: NOW,
    updated_at: NOW,
    raw_text: `2026-04-01 * "Marriott Bonvoy" "annual reset" #reward-expiry
  Assets:Rewards:Status:Marriott        -42.00 MAR-NIGHTS
  Expenses:Void                          42.00 MAR-NIGHTS
`,
  },
  {
    id: 6,
    created_at: NOW,
    updated_at: NOW,
    raw_text: `2026-04-18 * "HDFC" "1% cashback on fuel" #cashback
  Liabilities:CC:HDFC:Infinia           -47.00 INR
  Income:Void                            47.00 INR
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
  return <LedgerView email="ameya.karve@gmail.com" />
}

const meta: Meta<typeof MockedShell> = {
  title: 'LedgerNew / Shell',
  component: MockedShell,
  parameters: { layout: 'fullscreen' },
}
export default meta

type Story = StoryObj<typeof MockedShell>

export const StitchV5: Story = {}
