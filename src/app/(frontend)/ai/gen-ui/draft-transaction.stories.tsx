import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import {
  DraftTransactionBatchCard,
  type DraftTransactionBatchCardProps,
} from './draft-transaction'

// The card takes { id, text } entries where text is one beancount entry.
type Entry = { id: string; text: string }
function tx(
  id: string,
  date: string,
  payee: string,
  narration: string,
  postings: Array<[account: string, amount: string, currency: string, price?: string]>,
): Entry {
  const lines = postings.map(
    ([account, amount, currency, price]) =>
      `  ${account}  ${amount} ${currency}${price ? ` ${price}` : ''}`,
  )
  return { id, text: `${date} * "${payee}" "${narration}"\n${lines.join('\n')}` }
}

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

const BALANCED = tx('b1', '2026-05-26', 'Whole Foods', 'Weekly grocery run', [
  ['Expenses:Food:Groceries', '42.10', 'USD'],
  ['Assets:Bank:Chase:Checking', '-42.10', 'USD'],
])

const UNBALANCED = tx('u1', '2026-05-26', 'Whole Foods', 'Weekly grocery run', [
  ['Expenses:Food:Groceries', '42.10', 'USD'],
  ['Assets:Bank:Chase:Checking', '-38.00', 'USD'],
])

const SPLIT = tx('s1', '2026-05-26', 'Costco', 'Run', [
  ['Expenses:Food:Groceries', '120.50', 'USD'],
  ['Expenses:Household', '79.99', 'USD'],
  ['Liabilities:CreditCard:Amex', '-200.49', 'USD'],
])

const FOREX = tx('f1', '2026-05-13', 'Cloudflare', 'Subscription', [
  ['Expenses:Software:Subscriptions', '2.36', 'USD', '@@ 225.98 INR'],
  ['Expenses:Bank:ForexMarkup', '4.52', 'INR'],
  ['Expenses:Tax:GST', '0.81', 'INR'],
  ['Liabilities:CreditCards:Axis:Magnus', '-231.31', 'INR'],
])

const STATEMENT_BATCH: Entry[] = [
  tx('t1', '2026-05-02', 'Trader Joe’s', 'Groceries', [
    ['Expenses:Food:Groceries', '58.20', 'USD'],
    ['Liabilities:CreditCard:Amex', '-58.20', 'USD'],
  ]),
  tx('t2', '2026-05-05', 'Shell', 'Gas', [
    ['Expenses:Travel:Air', '41.00', 'USD'],
    ['Liabilities:CreditCard:Amex', '-41.00', 'USD'],
  ]),
  tx('t3', '2026-05-07', 'Spotify', 'Monthly subscription', [
    ['Expenses:Food:Dining', '9.99', 'USD'],
    ['Liabilities:CreditCard:Amex', '-9.99', 'USD'],
  ]),
]

function CardShell(props: Partial<DraftTransactionBatchCardProps>) {
  const [logs, setLogs] = useState<string[]>([])
  const push = (s: string) => setLogs((l) => [...l, s])
  return (
    <div className="min-h-screen bg-[#fbfbfa] p-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-[12px] bg-slate-50 px-4 py-3 text-sm text-slate-900">
          <DraftTransactionBatchCard
            input={{ entries: [BALANCED] }}
            accounts={ACCOUNTS}
            onApprove={(f: string) => push(`approve\n${f}`)}
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
  args: { input: { entries: [UNBALANCED] } },
}

export const ThreePostingSplit: StoryObj<typeof CardShell> = {
  args: { input: { entries: [SPLIT] } },
}

export const Forex: StoryObj<typeof CardShell> = {
  args: { input: { entries: [FOREX] } },
}

export const Batch: StoryObj<typeof CardShell> = {
  args: { input: { entries: STATEMENT_BATCH } },
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
