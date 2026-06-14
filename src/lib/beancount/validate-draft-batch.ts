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

// Per-entry verdict — the SINGLE source of truth for "is this draft entry
// approvable, and if not, why". Both the tool boundary (validateDraftBatch,
// which feeds the model actionable messages) and the approval card (which
// renders the badge + gates the Approve button) classify through this, so the
// two can never disagree on what's valid. `messages` carries the full
// human/LLM-facing strings; the structured fields (`isBalance`, `count`,
// `residuals`) drive the card's badge without re-parsing the message text.
export type DraftEntryVerdict =
  | { kind: 'ok'; isBalance: boolean }
  | { kind: 'parse_error'; messages: string[] }
  | { kind: 'wrong_kind'; messages: string[] }
  | { kind: 'wrong_count'; count: number; messages: string[] }
  | { kind: 'dropped_posting'; messages: string[] }
  | { kind: 'elided'; messages: string[] }
  | {
      kind: 'unbalanced'
      residuals: { currency: string; amount: string }[]
      messages: string[]
    }
  | { kind: 'account_shape'; messages: string[] }

// Classify ONE draft entry. `label` is the prefix for the LLM-facing messages
// (the tool passes "entry N"); the card leaves it default and reads the
// structured fields instead.
export function classifyDraftEntry(text: string, label = 'entry'): DraftEntryVerdict {
  const parsed = parseJournalStrict(text)
  if (isStrictParseErr(parsed)) {
    return { kind: 'parse_error', messages: [`${label}: ${parsed.message}`] }
  }
  // Balance assertions (optionally with their pad folded in — the parser
  // absorbs a same-account pad into the balance's plug_account) are first-
  // class draft entries: statements state opening/closing balances and the
  // import should assert them. Other directive kinds stay out of drafts.
  const onlyBalances =
    parsed.transactions.length === 0 &&
    parsed.directives.length > 0 &&
    parsed.directives.every((d) => d.kind === 'balance')
  if (onlyBalances) return { kind: 'ok', isBalance: true }
  if (parsed.directives.length > 0) {
    return {
      kind: 'wrong_kind',
      messages: [
        `${label}: only kind "transaction", "balance", or "pad" entries are allowed in a draft`,
      ],
    }
  }
  if (parsed.transactions.length !== 1) {
    return {
      kind: 'wrong_count',
      count: parsed.transactions.length,
      messages: [
        `${label}: each element must contain exactly one transaction (got ${parsed.transactions.length})`,
      ],
    }
  }
  const txn = parsed.transactions[0]!
  const tag = txn.payee ? ` "${txn.payee}"` : ''
  // No silent drops: every posting line in the source must have parsed.
  const dropped = countPostingLines(text) - txn.postings.length
  if (dropped > 0) {
    return {
      kind: 'dropped_posting',
      messages: [
        `${label}${tag}: ${dropped} posting line(s) failed to parse and were silently dropped — each posting must start with a capitalized account (Assets/Liabilities/Equity/Income/Expenses) with NO spaces, followed by a numeric amount and currency`,
      ],
    }
  }
  // No eliding: beancount would infer a blank amount, but we require every
  // posting to state an explicit, numeric amount AND currency.
  const incomplete = txn.postings.filter(
    (p) => p.amount == null || p.currency == null || decimalToScaled(p.amount) == null,
  )
  if (incomplete.length > 0) {
    return {
      kind: 'elided',
      messages: incomplete.map(
        (p) =>
          `${label}${tag}: posting ${p.account} must state an explicit numeric amount and currency — no elided or blank amounts`,
      ),
    }
  }
  // Balance and account-shape both run (an entry can fail both) — preserve the
  // tool's full message stream, but lead the verdict with the imbalance.
  const balance = validateTransactionBalance(txn)
  const shape = validateAccountShapes([txn], [])
  const messages: string[] = []
  if (balance) messages.push(`${label} (${txn.date}${tag}): ${balance.message}`)
  for (const s of shape) messages.push(`${label}: ${s.message}`)
  if (balance) return { kind: 'unbalanced', residuals: balance.residuals, messages }
  if (shape.length > 0) return { kind: 'account_shape', messages }
  return { kind: 'ok', isBalance: false }
}

export function validateDraftBatch(entries: string[]): DraftValidationResult {
  const issues: DraftValidationIssue[] = []
  entries.forEach((text, index) => {
    const verdict = classifyDraftEntry(text, `entry ${index + 1}`)
    if (verdict.kind === 'ok') return
    for (const message of verdict.messages) issues.push({ index, message })
  })
  if (issues.length === 0) return { ok: true }
  return { ok: false, issues }
}
