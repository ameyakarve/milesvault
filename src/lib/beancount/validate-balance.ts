import type { PostingInput, TransactionInput } from '@/durable/ledger-types'
import {
  decimalToScaled,
  scaledAdd,
  scaledFormat,
  scaledIsZero,
  scaledMul,
  scaledNeg,
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
  // A price in the SAME commodity as the posting (X CUR @@/@ Y CUR with Y == X)
  // is meaningless — a commodity can't be priced in itself. Reject it so it
  // can't be used to fake a zero balance (e.g. miles @@ the same miles).
  for (const p of txn.postings) {
    if (
      p.price_at_signs &&
      p.currency != null &&
      p.price_currency != null &&
      p.price_currency === p.currency
    ) {
      return {
        kind: 'unbalanced',
        txnIndex,
        date: txn.date,
        payee: txn.payee ?? null,
        narration: txn.narration ?? null,
        residuals: [],
        message: `posting ${p.account} prices ${p.currency} in ${p.currency} — a price (@ / @@) must be denominated in a DIFFERENT commodity. Either drop the price (plain amount) or use the correct other commodity.`,
      }
    }
  }
  const sums = new Map<string, Scaled>()
  const weights: { account: string; currency: string; amount: Scaled; via: 'native' | '@' | '@@' }[] = []
  for (const p of txn.postings) {
    const w = postingWeight(p)
    if (!w) continue
    const via: 'native' | '@' | '@@' =
      p.price_at_signs === 2 ? '@@' : p.price_at_signs === 1 ? '@' : 'native'
    weights.push({ account: p.account, currency: w.currency, amount: w.amount, via })
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
    message: formatBalanceMessage(residuals, weights),
  }
}

// Per-posting weight breakdown for each unbalanced currency. The bare
// "residual N CCY" the SDK shows the model on a tool-error isn't enough
// signal to actually correct the entry — without seeing which postings
// contributed and what the debit/credit split is, the model just regenerates
// the same arithmetic and spirals. Listing the weights lets it see exactly
// which leg is off (or that a leg is missing).
function formatBalanceMessage(
  residuals: { currency: string; amount: string }[],
  weights: { account: string; currency: string; amount: Scaled; via: 'native' | '@' | '@@' }[],
): string {
  const lines: string[] = ['transaction does not balance:']
  for (const r of residuals) {
    const inCcy = weights.filter((w) => w.currency === r.currency)
    let debits: Scaled | null = null
    let credits: Scaled | null = null
    for (const w of inCcy) {
      if (w.amount.scaled >= 0) {
        debits = debits ? scaledAdd(debits, w.amount) : w.amount
      } else {
        credits = credits ? scaledAdd(credits, w.amount) : w.amount
      }
    }
    lines.push(`  ${r.currency}: net = ${signed(r.amount)} (must be 0)`)
    for (const w of inCcy) {
      const tag = w.via === '@@' ? ' (via @@)' : w.via === '@' ? ' (via @)' : ''
      lines.push(`    ${w.account}: ${signed(scaledFormat(w.amount))} ${w.currency}${tag}`)
    }
    if (debits || credits) {
      const dStr = debits ? scaledFormat(debits) : '0'
      const cStr = credits ? scaledFormat(credits) : '0'
      lines.push(`    debits=${dStr}, credits=${cStr}, diff=${signed(r.amount)}`)
    }
    // Sign-flip heuristic (likely, not definitive): if negating exactly one
    // leg would zero the net — i.e. the imbalance is exactly TWICE that leg —
    // its sign is almost certainly backwards. Two equal, same-sign legs (a
    // payment with both legs +, a refund pair both −) are the classic case.
    const net = inCcy.reduce<Scaled | null>(
      (acc, w) => (acc ? scaledAdd(acc, w.amount) : w.amount),
      null,
    )
    if (net) {
      for (const w of inCcy) {
        if (scaledIsZero(scaledAdd(net, scaledNeg(scaledAdd(w.amount, w.amount))))) {
          lines.push(
            `    LIKELY SIGN FLIP: ${w.account} is ${signed(scaledFormat(w.amount))} ${r.currency} ` +
              `and the imbalance (${signed(r.amount)}) is exactly twice that — flipping this leg's sign ` +
              `balances it. Check whether this posting should be the opposite sign (don't change amounts).`,
          )
        }
      }
    }
    lines.push(
      `    fix: adjust postings so ${r.currency} weights sum to 0 (a single leg ` +
        `off by ${signed(r.amount)}, OR a leg is missing/extra). Do not just retry the same numbers.`,
    )
  }
  return lines.join('\n')
}

function signed(amount: string): string {
  if (amount.startsWith('-') || amount.startsWith('+')) return amount
  return amount === '0' ? '0' : `+${amount}`
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
