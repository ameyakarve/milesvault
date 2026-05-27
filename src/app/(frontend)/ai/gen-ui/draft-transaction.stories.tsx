import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import {
  DraftTransactionBatchCard,
  type DraftTransactionBatchCardProps,
} from './draft-transaction'
import type { DraftTransaction } from '@/durable/agent-ui-schemas'

const ACCOUNTS = [
  'Assets:Bank:Chase:Checking',
  'Assets:Bank:HDFC:Savings',
  'Assets:Cash',
  'Expenses:Food:Groceries',
  'Expenses:Food:Dining',
  'Expenses:Rent',
  'Expenses:Travel:Air',
  'Expenses:Travel:Hotel',
  'Income:Salary',
  'Liabilities:CreditCard:Amex',
]

const BALANCED: DraftTransaction = {
  date: '2026-05-26',
  flag: '*',
  payee: 'Whole Foods',
  narration: 'Weekly grocery run',
  postings: [
    { account: 'Expenses:Food:Groceries', amount: 42.1, currency: 'USD' },
    { account: 'Assets:Bank:Chase:Checking', amount: -42.1, currency: 'USD' },
  ],
}

const UNBALANCED: DraftTransaction = {
  date: '2026-05-26',
  payee: 'Whole Foods',
  narration: 'Weekly grocery run',
  postings: [
    { account: 'Expenses:Food:Groceries', amount: 42.1, currency: 'USD' },
    { account: 'Assets:Bank:Chase:Checking', amount: -38.0, currency: 'USD' },
  ],
}

const SPLIT: DraftTransaction = {
  date: '2026-05-26',
  payee: 'Costco',
  narration: 'Run',
  postings: [
    { account: 'Expenses:Food:Groceries', amount: 120.5, currency: 'USD' },
    { account: 'Expenses:Household', amount: 79.99, currency: 'USD' },
    { account: 'Liabilities:CreditCard:Amex', amount: -200.49, currency: 'USD' },
  ],
}

const STATEMENT_BATCH: DraftTransaction[] = [
  {
    date: '2026-05-02',
    flag: '*',
    payee: 'Trader Joe’s',
    narration: 'Groceries',
    postings: [
      { account: 'Expenses:Food:Groceries', amount: 58.2, currency: 'USD' },
      { account: 'Liabilities:CreditCard:Amex', amount: -58.2, currency: 'USD' },
    ],
  },
  {
    date: '2026-05-05',
    flag: '*',
    payee: 'Shell',
    narration: 'Gas',
    postings: [
      { account: 'Expenses:Travel:Air', amount: 41.0, currency: 'USD' },
      { account: 'Liabilities:CreditCard:Amex', amount: -41.0, currency: 'USD' },
    ],
  },
  {
    date: '2026-05-07',
    flag: '*',
    payee: 'Spotify',
    narration: 'Monthly subscription',
    postings: [
      { account: 'Expenses:Food:Dining', amount: 9.99, currency: 'USD' },
      { account: 'Liabilities:CreditCard:Amex', amount: -9.99, currency: 'USD' },
    ],
  },
]

function CardShell(props: Partial<DraftTransactionBatchCardProps>) {
  const [logs, setLogs] = useState<string[]>([])
  const push = (s: string) => setLogs((l) => [...l, s])
  return (
    <div className="min-h-screen bg-[#fbfbfa] p-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-[12px] bg-slate-50 px-4 py-3 text-sm text-slate-900">
          <DraftTransactionBatchCard
            input={{ transactions: [BALANCED] }}
            accounts={ACCOUNTS}
            onApprove={(f: DraftTransaction[]) =>
              push(`approve ${JSON.stringify(f)}`)
            }
            onReject={() => push('reject')}
            {...props}
          />
        </div>
        {logs.length > 0 && (
          <pre className="overflow-x-auto rounded-[8px] border border-slate-200 bg-white p-3 text-[11px] text-slate-700">
            {logs.join('\n')}
          </pre>
        )}
      </div>
    </div>
  )
}

const meta: Meta<typeof CardShell> = {
  title: 'Chat/DraftTransaction',
  component: CardShell,
  parameters: { layout: 'fullscreen' },
}
export default meta

export const Balanced: StoryObj<typeof CardShell> = {}

export const Unbalanced: StoryObj<typeof CardShell> = {
  args: { input: { transactions: [UNBALANCED] } },
}

export const ThreePostingSplit: StoryObj<typeof CardShell> = {
  args: { input: { transactions: [SPLIT] } },
}

export const Batch: StoryObj<typeof CardShell> = {
  args: { input: { transactions: STATEMENT_BATCH } },
}

export const Submitting: StoryObj<typeof CardShell> = {
  args: { status: 'submitting' },
}

export const Failed: StoryObj<typeof CardShell> = {
  args: {
    status: 'failed',
    errorMessage:
      'Assets:Bank:Chase:Checking: expected USD, found EUR',
  },
}

export const Done: StoryObj<typeof CardShell> = {
  args: { status: 'done' },
}
