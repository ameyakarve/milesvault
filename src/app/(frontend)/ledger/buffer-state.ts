import { parseBuffer, type ParsedTxn } from '@/lib/beancount/parse'
import { coreValidators, type ValidateContext } from '@/lib/beancount/validators'

export type BufferState =
  | { kind: 'clean' }
  | { kind: 'pending' }
  | { kind: 'dirty' }
  | { kind: 'staged'; validated: boolean }

export function evaluateBuffer(buffer: string, baseline: string): BufferState {
  if (buffer === baseline) return { kind: 'clean' }
  const { entries, diagnostics } = parseBuffer(buffer)
  if (diagnostics.length > 0) return { kind: 'dirty' }
  const ctx: ValidateContext = { parsed: entries, doc: buffer }
  for (const v of coreValidators) {
    try {
      if (v(ctx).length > 0) return { kind: 'staged', validated: false }
    } catch {
      return { kind: 'staged', validated: false }
    }
  }
  return { kind: 'staged', validated: true }
}

function entryText(txn: ParsedTxn, doc: string): string {
  return doc.slice(txn.range.from, txn.range.to)
}

export function countEditedEntries(buffer: string, baseline: string): number {
  if (buffer === baseline) return 0
  const baseEntries = parseBuffer(baseline).entries
  const bufEntries = parseBuffer(buffer).entries
  const baseTexts = baseEntries.map((e) => entryText(e, baseline))
  const bufTexts = bufEntries.map((e) => entryText(e, buffer))
  const baseSet = new Set(baseTexts)
  let count = 0
  for (const t of bufTexts) if (!baseSet.has(t)) count++
  count += Math.max(0, baseTexts.length - bufTexts.length)
  return count
}
