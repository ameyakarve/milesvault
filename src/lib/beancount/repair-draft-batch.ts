import {
  decimalToScaled,
  scaledAdd,
  scaledFormat,
  type Scaled,
} from './decimal'
import { isStrictParseErr, parseJournalStrict } from './parse-strict'
import { validateTransactionBalance } from './validate-balance'

// Programmatic repair for the rounding class. The model routinely produces
// forex-card entries that are off by ₹0.01 because it rounds intermediate INR
// amounts inconsistently (e.g., 5825.78 + 116.52 + 6.82 + 37.87 = 5986.99, but
// it writes -5987.00 on the liability posting). LLMs can't reliably fix this
// on retry — they round the same way again. So we snap deterministically
// before the AI SDK's tool-error path fires.
//
// Heuristic: for each entry whose only balance defect is a single-currency
// residual within `SNAP_THRESHOLD_MINOR_UNITS`, find the LAST posting in that
// currency with no `@`/`@@` price annotation and absorb the residual into it.
// Above the threshold, or with no eligible posting, we return the entry
// untouched — refine will then surface a normal tool-error and the model can
// retry (still subject to the spiral; that's a separate problem).
//
// Wired in via `chat-do.ts` -> `repairToolCall` (forwarded to
// streamText's `experimental_repairToolCall`). See patches/@cloudflare__think@0.7.1.patch.

// 100 minor units = ₹1.00 (or any 2dp currency). Covers a few-paisa rounding
// drift without masking genuine model arithmetic errors.
const SNAP_THRESHOLD_MINOR_UNITS = 100

export type RepairResult = {
  changed: boolean
  transactions: string[]
}

export function repairDraftBatch(entries: string[]): RepairResult {
  let changed = false
  const out = entries.map((text) => {
    const repaired = tryRepairEntry(text)
    if (repaired === null) return text
    changed = true
    return repaired
  })
  return { changed, transactions: out }
}

function tryRepairEntry(text: string): string | null {
  const parsed = parseJournalStrict(text)
  if (isStrictParseErr(parsed)) return null
  if (parsed.transactions.length !== 1) return null
  const txn = parsed.transactions[0]!
  const issue = validateTransactionBalance(txn)
  if (!issue || issue.residuals.length !== 1) return null

  const residual = issue.residuals[0]!
  const residualScaled = decimalToScaled(residual.amount)
  if (!residualScaled) return null
  if (Math.abs(residualScaled.scaled) > SNAP_THRESHOLD_MINOR_UNITS) return null

  let candidateIdx = -1
  for (let i = txn.postings.length - 1; i >= 0; i--) {
    const p = txn.postings[i]!
    if (
      p.currency === residual.currency &&
      p.amount != null &&
      (p.price_at_signs ?? 0) === 0
    ) {
      candidateIdx = i
      break
    }
  }
  if (candidateIdx === -1) return null
  const posting = txn.postings[candidateIdx]!
  const oldAmount = posting.amount!

  const currentScaled = decimalToScaled(oldAmount)
  if (!currentScaled) return null
  const delta: Scaled = {
    scaled: -residualScaled.scaled,
    scale: residualScaled.scale,
  }
  const newAmount = scaledFormat(scaledAdd(currentScaled, delta))

  const lines = text.split('\n')
  const matches: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim()
    if (
      trimmed.startsWith(posting.account) &&
      trimmed.includes(oldAmount) &&
      trimmed.endsWith(residual.currency)
    ) {
      matches.push(i)
    }
  }
  if (matches.length !== 1) return null
  const lineIdx = matches[0]!
  const replaced = lines[lineIdx]!.replace(oldAmount, newAmount)
  if (replaced === lines[lineIdx]) return null
  lines[lineIdx] = replaced
  return lines.join('\n')
}
