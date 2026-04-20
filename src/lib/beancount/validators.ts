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

export const coreValidators: readonly Validator[] = [balanceValidator]

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
