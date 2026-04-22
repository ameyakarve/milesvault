import type { Diagnostic } from '@codemirror/lint'
import { parse as parseBean } from 'beancount'
import { postingWeight } from './extract'
import type { ParsedTxn } from './parse'

export type ValidateContext = { parsed: readonly ParsedTxn[]; doc: string }
export type Validator = (ctx: ValidateContext) => Diagnostic[]

const BALANCE_EPSILON = 0.005

export const balanceValidator: Validator = ({ parsed, doc }) => {
  const out: Diagnostic[] = []
  for (const txn of parsed) {
    const slice = doc.slice(txn.range.from, txn.range.to)
    let bean
    try {
      bean = parseBean(slice).transactions[0]
    } catch {
      continue
    }
    if (!bean) continue
    const sums = new Map<string, number>()
    let elided = 0
    let skipped = false
    for (const p of bean.postings) {
      if (p.amount == null) {
        elided += 1
        continue
      }
      const w = postingWeight(p)
      if (w == null) {
        skipped = true
        break
      }
      sums.set(w.ccy, (sums.get(w.ccy) ?? 0) + w.n)
    }
    if (skipped || elided > 0) continue
    const unbalanced = [...sums].filter(([, v]) => Math.abs(v) > BALANCE_EPSILON)
    if (unbalanced.length === 0) continue
    const detail = unbalanced
      .map(([c, v]) => `${c || '?'}=${formatAmount(v)}`)
      .join(', ')
    out.push({
      from: txn.headerRange.from,
      to: txn.headerRange.to,
      severity: 'error',
      message: `Unbalanced: ${detail}.`,
      source: 'balance',
    })
  }
  return out
}

export const payeePresentValidator: Validator = ({ parsed }) => {
  const out: Diagnostic[] = []
  for (const txn of parsed) {
    if (txn.payee && txn.payee.trim().length > 0) continue
    out.push({
      from: txn.headerRange.from,
      to: txn.headerRange.to,
      severity: 'error',
      message:
        'Missing payee. Header must be `YYYY-MM-DD * "payee" "narration"` (both strings).',
      source: 'payee-present',
    })
  }
  return out
}

export const amountRequiredValidator: Validator = ({ parsed }) => {
  const out: Diagnostic[] = []
  for (const txn of parsed) {
    for (const p of txn.postings) {
      if (p.amount) continue
      out.push({
        from: p.range.from,
        to: p.range.to,
        severity: 'error',
        message: `Posting must have an amount; got '${p.account}' with no amount.`,
        source: 'amount-required',
      })
    }
  }
  return out
}

const CASHBACK_ACCOUNT = 'Income:Rewards:Cashback'

export const cashbackValidator: Validator = ({ parsed }) => {
  const out: Diagnostic[] = []
  for (const txn of parsed) {
    for (const p of txn.postings) {
      if (p.account !== CASHBACK_ACCOUNT) continue
      if (!p.amount) continue
      const n = parseNumber(p.amount.numberText)
      if (n == null) continue
      if (n >= 0) {
        out.push({
          from: p.amount.range.from,
          to: p.amount.range.to,
          severity: 'error',
          message: `${CASHBACK_ACCOUNT} posting must be negative; got ${p.amount.numberText}.`,
          source: 'cashback-sign',
        })
        continue
      }
      const ccy = p.amount.currency ?? ''
      const counterpart = txn.postings.find((o) => {
        if (o === p) return false
        if (!o.amount) return false
        const m = parseNumber(o.amount.numberText)
        if (m == null) return false
        if ((o.amount.currency ?? '') !== ccy) return false
        return Math.abs(m + n) < BALANCE_EPSILON
      })
      if (!counterpart) {
        out.push({
          from: p.range.from,
          to: p.range.to,
          severity: 'error',
          message: `${CASHBACK_ACCOUNT} must have one matching posting with amount ${formatAmount(-n)} ${ccy || '?'}.`,
          source: 'cashback-counterpart',
        })
      }
    }
  }
  return out
}

export const cashbackNeedsPaymentValidator: Validator = ({ parsed }) => {
  const out: Diagnostic[] = []
  for (const txn of parsed) {
    let hasCashback = false
    let hasOther = false
    for (const p of txn.postings) {
      if (p.account === CASHBACK_ACCOUNT) {
        hasCashback = true
        continue
      }
      if (p.account === 'Expenses' || p.account.startsWith('Expenses:')) continue
      hasOther = true
    }
    if (!hasCashback || hasOther) continue
    out.push({
      from: txn.headerRange.from,
      to: txn.headerRange.to,
      severity: 'error',
      message: `Cashback txn must be paid with something other than expenses + cashback (add a card, bank, or cash leg).`,
      source: 'cashback-needs-payment',
    })
  }
  return out
}

export const coreValidators: readonly Validator[] = [
  balanceValidator,
  payeePresentValidator,
  amountRequiredValidator,
  cashbackValidator,
  cashbackNeedsPaymentValidator,
]

function parseNumber(text: string): number | null {
  const n = Number(text.split(',').join(''))
  return Number.isFinite(n) ? n : null
}

function formatAmount(v: number): string {
  if (Number.isInteger(v)) return v.toFixed(0)
  return v.toFixed(2)
}
