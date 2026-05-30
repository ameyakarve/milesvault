import type { PostingInput, TransactionInput } from '@/durable/ledger-types'
import {
  decimalToScaled,
  scaledAdd,
  scaledFormat,
  scaledIsZero,
  scaledMul,
  type Scaled,
} from './decimal'

// Each transaction's postings must sum to zero per (weight) currency. Beancount
// "weight" rules:
//   - No price (no `@` / `@@`)  : weight = amount in posting's currency
//   - `@@` total price          : weight = ±price_amount in price_currency
//                                  (sign matches the amount's sign)
//   - `@`  per-unit price       : weight = amount * price_amount in price_currency
//
// We compute weights only — the native amount on a priced posting doesn't
// affect balance (the price translates it into the target currency for the
// balance check). This is what catches a points purchase that's missing its
// `Equity:Void` contra: INR balances but the point currency has a residual.

export type BalanceIssue = {
  kind: 'unbalanced'
  txnIndex?: number
  date: string
  payee?: string | null
  narration?: string | null
  residuals: { currency: string; amount: string }[]
  message: string
}

function postingWeight(
  p: PostingInput,
): { amount: Scaled; currency: string } | null {
  if (p.amount == null || p.currency == null) return null
  const amt = decimalToScaled(p.amount)
  if (!amt) return null
  if (
    p.price_at_signs === 2 &&
    p.price_amount != null &&
    p.price_currency != null
  ) {
    const price = decimalToScaled(p.price_amount)
    if (!price) return null
    // @@ — price_amount is the absolute total; sign comes from the amount.
    const sign = amt.scaled >= 0 ? 1 : -1
    return {
      amount: { scaled: sign * Math.abs(price.scaled), scale: price.scale },
      currency: p.price_currency,
    }
  }
  if (
    p.price_at_signs === 1 &&
    p.price_amount != null &&
    p.price_currency != null
  ) {
    const price = decimalToScaled(p.price_amount)
    if (!price) return null
    return { amount: scaledMul(amt, price), currency: p.price_currency }
  }
  return { amount: amt, currency: p.currency }
}

export function validateTransactionBalance(
  txn: TransactionInput,
  txnIndex?: number,
): BalanceIssue | null {
  const sums = new Map<string, Scaled>()
  for (const p of txn.postings) {
    const w = postingWeight(p)
    if (!w) continue
    const prev = sums.get(w.currency)
    sums.set(w.currency, prev ? scaledAdd(prev, w.amount) : w.amount)
  }
  const residuals: { currency: string; amount: string }[] = []
  for (const [currency, s] of sums) {
    if (!scaledIsZero(s))
      residuals.push({ currency, amount: scaledFormat(s) })
  }
  if (residuals.length === 0) return null
  return {
    kind: 'unbalanced',
    txnIndex,
    date: txn.date,
    payee: txn.payee ?? null,
    narration: txn.narration ?? null,
    residuals,
    message: `transaction does not balance — residual ${residuals
      .map((r) => `${r.amount} ${r.currency}`)
      .join(', ')}`,
  }
}

export function validateBatchBalance(
  transactions: TransactionInput[],
): BalanceIssue[] {
  const issues: BalanceIssue[] = []
  transactions.forEach((t, i) => {
    const issue = validateTransactionBalance(t, i)
    if (issue) issues.push(issue)
  })
  return issues
}
