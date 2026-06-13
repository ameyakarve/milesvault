import { decimalToScaled } from './decimal'
import { isStrictParseErr, parseJournalStrict } from './parse-strict'
import { validateAccountShapes } from './validate-account-shape'
import { validateTransactionBalance } from './validate-balance'

// Tool-time validator for a batch of LLM-emitted Beancount transaction strings
// (the `transactions` array of a `draft_transaction` call). Catches the same
// classes of error the write path catches at the journal boundary:
//   - parse errors
//   - postings the parser SILENTLY DROPS (a malformed account line vanishes
//     without erroring — we count source posting lines vs parsed and reject)
//   - ELIDED amounts (beancount infers a blank posting amount; we forbid it —
//     every posting must state an explicit numeric amount + currency)
//   - non-balancing transactions (the canonical "missing Equity:Void contra"
//     bug for points-bearing entries)
//   - account-shape violations (credit-card segment count, etc.)
//
// No silent failures: anything the parser would swallow or infer is surfaced
// back to the model as an actionable issue. Currency-lock checks require the
// full ledger context (carry-over entries) and are skipped here; replaceBuffer
// enforces them on persist.

// A "posting line" is an indented, non-blank line under a transaction header
// that is NOT a comment (`;`) and NOT a metadata line (`key: value`, lowercase
// key). The parser drops a posting it can't read WITHOUT raising — so if the
// source has more posting lines than the parse produced, a posting was silently
// lost and the entry must bounce.
function countPostingLines(entryText: string): number {
  let n = 0
  for (const line of entryText.split('\n')) {
    if (!/^\s+\S/.test(line)) continue // not an indented content line
    const t = line.trim()
    if (t.startsWith(';')) continue // comment
    // `key: value` metadata — a lowercase key then a colon FOLLOWED BY a space.
    // The space matters: a lowercase ACCOUNT ("assets:bank  10 USD") has no
    // space after its colon, so it stays a posting line and a dropped lowercase
    // account is still detected rather than mistaken for metadata.
    if (/^[a-z][A-Za-z0-9_-]*:(\s|$)/.test(t)) continue
    n++
  }
  return n
}

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
      issues.push({ index, message: `${label}: ${parsed.message}` })
      return
    }
    // Balance assertions (optionally with their pad folded in — the parser
    // absorbs a same-account pad into the balance's plug_account) are first-
    // class draft entries: statements state opening/closing balances and the
    // import should assert them. Other directive kinds stay out of drafts.
    const onlyBalances =
      parsed.transactions.length === 0 &&
      parsed.directives.length > 0 &&
      parsed.directives.every((d) => d.kind === 'balance')
    if (onlyBalances) return
    if (parsed.directives.length > 0) {
      issues.push({
        index,
        message: `${label}: only kind "transaction", "balance", or "pad" entries are allowed in a draft`,
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
    // No silent drops: every posting line in the source must have parsed.
    const dropped = countPostingLines(text) - txn.postings.length
    if (dropped > 0) {
      issues.push({
        index,
        message: `${label}${tag}: ${dropped} posting line(s) failed to parse and were silently dropped — each posting must start with a capitalized account (Assets/Liabilities/Equity/Income/Expenses) with NO spaces, followed by a numeric amount and currency`,
      })
      return
    }
    // No eliding: beancount would infer a blank amount, but we require every
    // posting to state an explicit, numeric amount AND currency.
    const incomplete = txn.postings.filter(
      (p) => p.amount == null || p.currency == null || decimalToScaled(p.amount) == null,
    )
    if (incomplete.length > 0) {
      for (const p of incomplete) {
        issues.push({
          index,
          message: `${label}${tag}: posting ${p.account} must state an explicit numeric amount and currency — no elided or blank amounts`,
        })
      }
      return
    }
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
