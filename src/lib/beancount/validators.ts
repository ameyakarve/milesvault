import type { Diagnostic } from '@codemirror/lint'
import type { ParsedTxn } from './parse'

export type ValidateContext = { parsed: readonly ParsedTxn[]; doc: string }
export type Validator = (ctx: ValidateContext) => Diagnostic[]

const BALANCE_EPSILON = 1e-9

export const balanceValidator: Validator = ({ parsed }) => {
  const out: Diagnostic[] = []
  for (const txn of parsed) {
    const sums = new Map<string, number>()
    let elided = 0
    let skipped = false
    for (const p of txn.postings) {
      if (p.amount == null) {
        elided += 1
        continue
      }
      const n = parseNumber(p.amount.numberText)
      if (n == null) {
        skipped = true
        break
      }
      const ccy = p.amount.currency ?? ''
      sums.set(ccy, (sums.get(ccy) ?? 0) + n)
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

export const expenseSignValidator: Validator = ({ parsed }) => {
  const out: Diagnostic[] = []
  for (const txn of parsed) {
    for (const p of txn.postings) {
      if (p.account !== 'Expenses' && !p.account.startsWith('Expenses:')) continue
      if (!p.amount) continue
      const n = parseNumber(p.amount.numberText)
      if (n == null || n >= 0) continue
      out.push({
        from: p.amount.range.from,
        to: p.amount.range.to,
        severity: 'error',
        message: `Expenses posting should be positive; got ${p.amount.numberText}.`,
        source: 'expense-sign',
      })
    }
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

export const coreValidators: readonly Validator[] = [
  balanceValidator,
  expenseSignValidator,
  payeePresentValidator,
  amountRequiredValidator,
]

function parseNumber(text: string): number | null {
  const cleaned = text.replace(/,/g, '').trim()
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(cleaned)) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function formatAmount(v: number): string {
  if (Number.isInteger(v)) return v.toFixed(0)
  return v.toFixed(2)
}
