import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import {
  DraftTransactionBatchCard,
  type DraftTransactionBatchCardProps,
} from './draft-transaction'
import type { ExtractedEntry } from '@/durable/ingest/ir'
import type { TransactionInput } from '@/durable/ledger-types'

// The card takes structured IR entries (post-transform). Small builder so the
// stories read like the old beancount text.
function tx(
  id: string,
  date: string,
  payee: string,
  narration: string,
  postings: TransactionInput['postings'],
): ExtractedEntry {
  return { id, kind: 'transaction', txn: { date, flag: '*', payee, narration, tags: [], postings } }
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
  { account: 'Expenses:Food:Groceries', amount: '42.10', currency: 'USD' },
  { account: 'Assets:Bank:Chase:Checking', amount: '-42.10', currency: 'USD' },
])

const UNBALANCED = tx('u1', '2026-05-26', 'Whole Foods', 'Weekly grocery run', [
  { account: 'Expenses:Food:Groceries', amount: '42.10', currency: 'USD' },
  { account: 'Assets:Bank:Chase:Checking', amount: '-38.00', currency: 'USD' },
])

const SPLIT = tx('s1', '2026-05-26', 'Costco', 'Run', [
  { account: 'Expenses:Food:Groceries', amount: '120.50', currency: 'USD' },
  { account: 'Expenses:Household', amount: '79.99', currency: 'USD' },
  { account: 'Liabilities:CreditCard:Amex', amount: '-200.49', currency: 'USD' },
])

const FOREX = tx('f1', '2026-05-13', 'Cloudflare', 'Subscription', [
  {
    account: 'Expenses:Software:Subscriptions',
    amount: '2.36',
    currency: 'USD',
    price_at_signs: 2,
    price_amount: '225.98',
    price_currency: 'INR',
  },
  { account: 'Expenses:Bank:ForexMarkup', amount: '4.52', currency: 'INR' },
  { account: 'Expenses:Tax:GST', amount: '0.81', currency: 'INR' },
  { account: 'Liabilities:CreditCards:Axis:Magnus', amount: '-231.31', currency: 'INR' },
])

const STATEMENT_BATCH: ExtractedEntry[] = [
  tx('t1', '2026-05-02', 'Trader Joe’s', 'Groceries', [
    { account: 'Expenses:Food:Groceries', amount: '58.20', currency: 'USD' },
    { account: 'Liabilities:CreditCard:Amex', amount: '-58.20', currency: 'USD' },
  ]),
  tx('t2', '2026-05-05', 'Shell', 'Gas', [
    { account: 'Expenses:Travel:Air', amount: '41.00', currency: 'USD' },
    { account: 'Liabilities:CreditCard:Amex', amount: '-41.00', currency: 'USD' },
  ]),
  tx('t3', '2026-05-07', 'Spotify', 'Monthly subscription', [
    { account: 'Expenses:Food:Dining', amount: '9.99', currency: 'USD' },
    { account: 'Liabilities:CreditCard:Amex', amount: '-9.99', currency: 'USD' },
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
