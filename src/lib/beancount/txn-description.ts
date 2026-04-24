import { resolveAccount } from './entities/accounts'
import type { ParsedPosting, ParsedTxn } from './parse'

export type DescribeResult =
  | { kind: 'ok'; text: string }
  | { kind: 'unhandled' }

type DescribeHandler = (txn: ParsedTxn) => DescribeResult

const FALLBACK = '—'

const HANDLERS: readonly DescribeHandler[] = [expensePaymentHandler]

const PAYMENT_INSTRUMENT_PATHS: readonly string[] = [
  'Liabilities:CC',
  'Assets:DC',
  'Assets:UPI',
  'Assets:Cash',
  'Assets:Bank',
  'Assets:Loaded:PrepaidCards',
  'Assets:Loaded:ForexCards',
  'Assets:Loaded:Wallets',
  'Assets:Loaded:GiftCards',
]

export function generateTxnDescription(txn: ParsedTxn): string {
  for (const handler of HANDLERS) {
    const result = handler(txn)
    if (result.kind === 'ok') return result.text
  }
  return FALLBACK
}

function expensePaymentHandler(txn: ParsedTxn): DescribeResult {
  const expenses: ParsedPosting[] = []
  let paymentAccount: string | null = null
  let paymentLabel: string | null = null
  let paymentCount = 0

  for (const posting of txn.postings) {
    const resolved = resolveAccount(posting.account)
    if (!resolved) return { kind: 'unhandled' }

    if (resolved.matchedPath.startsWith('Expenses')) {
      expenses.push(posting)
      continue
    }
    if (PAYMENT_INSTRUMENT_PATHS.includes(resolved.matchedPath)) {
      paymentCount += 1
      if (paymentAccount === null) {
        paymentAccount = posting.account
        paymentLabel = resolved.chipLabel
      } else if (paymentAccount !== posting.account) {
        return { kind: 'unhandled' }
      }
      continue
    }
    return { kind: 'unhandled' }
  }

  if (expenses.length === 0 || paymentCount === 0 || paymentLabel === null) {
    return { kind: 'unhandled' }
  }

  const currency = expenses[0].amount?.currency
  if (!currency) return { kind: 'unhandled' }
  let total = 0
  for (const e of expenses) {
    if (!e.amount || e.amount.currency !== currency) return { kind: 'unhandled' }
    const n = parseFloat(e.amount.numberText)
    if (!Number.isFinite(n)) return { kind: 'unhandled' }
    total += n
  }

  return {
    kind: 'ok',
    text: `${currency} ${formatAmount(total)} paid using ${paymentLabel}`,
  }
}

function formatAmount(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}
