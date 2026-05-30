import { isStrictParseErr, parseJournalStrict } from './parse-strict'
import { validateAccountShapes } from './validate-account-shape'
import { validateTransactionBalance } from './validate-balance'

// Tool-time validator for a batch of LLM-emitted Beancount transaction strings
// (the `transactions` array of a `draft_transaction` call). Catches the same
// classes of error the write path catches at the journal boundary:
//   - parse errors
//   - non-balancing transactions (the canonical "missing Equity:Void contra"
//     bug for points-bearing entries)
//   - account-shape violations (credit-card segment count, etc.)
//
// Currency-lock checks require the full ledger context (carry-over entries)
// and are skipped here; replaceBuffer enforces them on persist.

export type DraftValidationIssue = {
  index: number // index in the input `transactions` array (0-based)
  message: string
}

export type DraftValidationResult =
  | { ok: true }
  | { ok: false; issues: DraftValidationIssue[] }

export function validateDraftBatch(entries: string[]): DraftValidationResult {
  const issues: DraftValidationIssue[] = []
  entries.forEach((text, index) => {
    const label = `entry ${index + 1}`
    const parsed = parseJournalStrict(text)
    if (isStrictParseErr(parsed)) {
      issues.push({ index, message: `${label}: parse error` })
      return
    }
    if (parsed.directives.length > 0) {
      issues.push({
        index,
        message: `${label}: contains a directive (balance/pad/open/...) — directives belong in a separate draft, not inside draft_transaction`,
      })
      return
    }
    if (parsed.transactions.length !== 1) {
      issues.push({
        index,
        message: `${label}: each element must contain exactly one transaction (got ${parsed.transactions.length})`,
      })
      return
    }
    const txn = parsed.transactions[0]!
    const tag = txn.payee ? ` "${txn.payee}"` : ''
    const balance = validateTransactionBalance(txn)
    if (balance) {
      issues.push({
        index,
        message: `${label} (${txn.date}${tag}): ${balance.message}`,
      })
    }
    const shape = validateAccountShapes([txn], [])
    for (const s of shape) {
      issues.push({ index, message: `${label}: ${s.message}` })
    }
  })
  if (issues.length === 0) return { ok: true }
  return { ok: false, issues }
}
