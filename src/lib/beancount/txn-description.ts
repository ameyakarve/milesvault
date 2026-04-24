import { resolveAccount } from './entities/accounts'
import type { ParsedPosting, ParsedTxn } from './parse'

export type DescribeResult =
  | { kind: 'ok'; text: string }
  | { kind: 'untyped'; reason: string }
  | { kind: 'unhandled' }

type DescribeHandler = (txn: ParsedTxn) => DescribeResult

const FALLBACK = '—'

const HANDLERS: readonly DescribeHandler[] = [expensePaymentHandler]

export function generateTxnDescription(txn: ParsedTxn): string {
  for (const handler of HANDLERS) {
    const result = handler(txn)
    if (result.kind === 'ok') return result.text
    if (result.kind === 'untyped') return `⚠ ${result.reason}`
  }
  return FALLBACK
}

function expensePaymentHandler(txn: ParsedTxn): DescribeResult {
  if (!txn.postings.some(isExpensePosting)) return { kind: 'unhandled' }

  const expenses: ParsedPosting[] = []
  const payments: ParsedPosting[] = []
  const untyped: string[] = []
  let paymentAccount: string | null = null
  let paymentLabel: string | null = null
  let mixedPayment = false

  for (const posting of txn.postings) {
    const resolved = resolveAccount(posting.account)
    if (!resolved || !resolved.glyph) {
      untyped.push(posting.account)
      continue
    }
    if (resolved.matchedPath.startsWith('Expenses')) {
      expenses.push(posting)
      continue
    }
    if (
      resolved.matchedPath.startsWith('Assets') ||
      resolved.matchedPath.startsWith('Liabilities')
    ) {
      payments.push(posting)
      if (paymentAccount === null) {
        paymentAccount = posting.account
        paymentLabel = resolved.chipLabel
      } else if (paymentAccount !== posting.account) {
        mixedPayment = true
      }
      continue
    }
    untyped.push(posting.account)
  }

  if (untyped.length > 0) {
    return { kind: 'untyped', reason: `Untyped account: ${untyped.join(', ')}` }
  }
  if (payments.length === 0 || mixedPayment || paymentLabel === null) {
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

function isExpensePosting(p: ParsedPosting): boolean {
  const r = resolveAccount(p.account)
  return r?.matchedPath.startsWith('Expenses') ?? false
}

function formatAmount(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}
