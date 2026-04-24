import { resolveAccount } from './entities/accounts'
import type { ParsedPosting, ParsedTxn } from './parse'

export type DescribeResult =
  | { kind: 'ok'; text: string }
  | { kind: 'unhandled' }

type DescribeHandler = (txn: ParsedTxn) => DescribeResult

const FALLBACK = 'A quiet morning sip — draft summary goes here.'

const HANDLERS: readonly DescribeHandler[] = [statusTierHandler, expensePaymentHandler]

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
  let resolvedCurrency: string | null = null
  let resolvedTotal = 0
  let hasPrice = false
  let priceSkew = false
  for (const e of expenses) {
    if (!e.amount || e.amount.currency !== currency) return { kind: 'unhandled' }
    const n = parseFloat(e.amount.numberText)
    if (!Number.isFinite(n)) return { kind: 'unhandled' }
    total += n
    const resolved = resolvePrice(e, n)
    if (!resolved) continue
    hasPrice = true
    if (resolvedCurrency === null) resolvedCurrency = resolved.currency
    else if (resolvedCurrency !== resolved.currency) priceSkew = true
    resolvedTotal += resolved.amount
  }

  const verb = total < 0 ? 'refunded to' : 'paid using'
  let text = `${currency} ${formatAmount(Math.abs(total))} ${verb} ${paymentLabel}`
  if (hasPrice && !priceSkew && resolvedCurrency !== null) {
    text += ` (${resolvedCurrency} ${formatAmount(Math.abs(resolvedTotal))})`
  }
  return { kind: 'ok', text }
}

function statusTierHandler(txn: ParsedTxn): DescribeResult {
  if (txn.postings.length !== 2) return { kind: 'unhandled' }
  let statusPosting: ParsedPosting | null = null
  let hasVoid = false
  for (const posting of txn.postings) {
    const resolved = resolveAccount(posting.account)
    if (!resolved) return { kind: 'unhandled' }
    if (resolved.matchedPath === 'Assets:Rewards:Status') {
      statusPosting = posting
      continue
    }
    if (posting.account === 'Expenses:Void') {
      hasVoid = true
      continue
    }
    return { kind: 'unhandled' }
  }
  if (!statusPosting || !hasVoid || !statusPosting.amount?.currency) {
    return { kind: 'unhandled' }
  }
  const n = parseFloat(statusPosting.amount.numberText)
  if (!Number.isFinite(n) || n === 0) return { kind: 'unhandled' }
  const verb = n > 0 ? 'added' : 'expired'
  const text = `${formatAmount(Math.abs(n))} ${statusPosting.amount.currency} ${verb}`
  return { kind: 'ok', text }
}

function resolvePrice(
  posting: ParsedPosting,
  amountN: number,
): { amount: number; currency: string } | null {
  const price = posting.priceAmount
  if (!price || !price.currency || posting.atSigns === null) return null
  const pn = parseFloat(price.numberText)
  if (!Number.isFinite(pn)) return null
  if (posting.atSigns === 2) {
    const sign = amountN < 0 ? -1 : 1
    return { amount: sign * pn, currency: price.currency }
  }
  return { amount: amountN * pn, currency: price.currency }
}

function formatAmount(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}
