// Standalone check of the F1 step-1 event diff: same multiset-diff logic as
// LedgerDO.replaceBuffer §4b, run against the real parser + serializer.
// Run: pnpm exec tsx scripts/eval/diff-events-check.ts
import { serializeJournal } from '../../src/lib/beancount/ast'
import { isStrictParseErr, parseJournalStrict } from '../../src/lib/beancount/parse-strict'

function entryTexts(buffer: string): string[] {
  const parsed = parseJournalStrict(buffer)
  if (isStrictParseErr(parsed)) throw new Error(`parse failed: ${parsed.message}`)
  return [
    ...parsed.transactions.map((t) => serializeJournal([t], [], { descending: false }).trimEnd()),
    ...parsed.directives.map((d) => serializeJournal([], [d], { descending: false }).trimEnd()),
  ]
}

function diff(oldTexts: string[], newTexts: string[]) {
  const oldByText = new Map<string, string[]>()
  for (const t of oldTexts) {
    const b = oldByText.get(t)
    if (b) b.push(t)
    else oldByText.set(t, [t])
  }
  const added: string[] = []
  for (const t of newTexts) {
    const b = oldByText.get(t)
    if (b && b.length > 0) b.pop()
    else added.push(t)
  }
  return { added, removed: [...oldByText.values()].flat() }
}

const OLD = `2026-06-01 * "Coffee Co" "flat white"
  Liabilities:CreditCards:Amex:Platinum  -4.50 USD
  Expenses:Food  4.50 USD

2026-06-02 * "Metro" "fare"
  Assets:Bank:Chase:Checking  -2.75 USD
  Expenses:Transport  2.75 USD

2026-06-03 event "status:krisflyer" "status-tier/krisflyer-gold"
`

// Case 1: no-op save (same buffer, formatting whitespace differences only)
const noop = diff(entryTexts(OLD), entryTexts(OLD + '\n'))
console.log('no-op save  →', noop.added.length, 'added,', noop.removed.length, 'removed (want 0/0)')

// Case 2: pure addition
const NEW_ADD = OLD + `
2026-06-04 * "Bookstore" "novel"
  Liabilities:CreditCards:Amex:Platinum  -12.00 USD
  Expenses:Shopping  12.00 USD
`
const add = diff(entryTexts(OLD), entryTexts(NEW_ADD))
console.log('addition    →', add.added.length, 'added,', add.removed.length, 'removed (want 1/0)')

// Case 3: modify one entry (amount change) = 1 removed + 1 added
const MOD = OLD.replace('4.50 USD\n  Expenses:Food  4.50', '5.00 USD\n  Expenses:Food  5.00')
const mod = diff(entryTexts(OLD), entryTexts(MOD))
console.log('modify      →', mod.added.length, 'added,', mod.removed.length, 'removed (want 1/1)')

// Case 4: duplicate entries — removing one of two identical txns
const DUP = OLD + '\n' + OLD.split('\n\n')[0] + '\n'
const dup = diff(entryTexts(DUP), entryTexts(OLD))
console.log('dedup one   →', dup.added.length, 'added,', dup.removed.length, 'removed (want 0/1)')

const ok =
  noop.added.length === 0 && noop.removed.length === 0 &&
  add.added.length === 1 && add.removed.length === 0 &&
  mod.added.length === 1 && mod.removed.length === 1 &&
  dup.added.length === 0 && dup.removed.length === 1
console.log(ok ? 'ALL OK' : 'MISMATCH')
process.exit(ok ? 0 : 1)
