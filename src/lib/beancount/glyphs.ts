import { EXPENSE_CATEGORIES } from './category-icons'

export type AccountGlyph = {
  text: string
  visualWidth: number
  label: string
  chipLabel: string
}

export const ACCOUNT_GLYPHS: readonly AccountGlyph[] = [
  { text: 'Liabilities:CC', visualWidth: 5, label: 'credit card', chipLabel: 'CC' },
  { text: 'Assets:DC', visualWidth: 5, label: 'debit card', chipLabel: 'DC' },
  { text: 'Assets:Loaded:PrepaidCards', visualWidth: 5, label: 'prepaid card', chipLabel: 'PP' },
  { text: 'Assets:Loaded:ForexCards', visualWidth: 5, label: 'forex card', chipLabel: 'FX' },
  { text: 'Assets:Bank', visualWidth: 7, label: 'bank', chipLabel: 'Bank' },
  { text: 'Assets:Rewards:Points', visualWidth: 9, label: 'rewards points', chipLabel: 'Points' },
  { text: 'Assets:Loaded:Wallets', visualWidth: 9, label: 'wallet', chipLabel: 'Wallet' },
  { text: 'Assets:Loaded:GiftCards', visualWidth: 7, label: 'gift card', chipLabel: 'Gift' },
  { text: 'Assets:Receivables', visualWidth: 6, label: 'receivable', chipLabel: 'Rcv' },
  { text: 'Assets:Cash', visualWidth: 7, label: 'cash', chipLabel: 'Cash' },
  { text: 'Income:Void', visualWidth: 7, label: 'void (source)', chipLabel: 'Void' },
]

export const ANY_ACCOUNT_RE = /[A-Z][A-Za-z0-9]*(?::[A-Za-z0-9]+)+/g

export type ExpenseChipMatch = {
  matchedPath: string
  consumedLen: number
  chipLabel: string
}

export type AccountChipMatch = {
  glyph: AccountGlyph
  consumedLen: number
  chipLabel: string
}

const GLYPH_BY_TEXT: Record<string, AccountGlyph> = Object.fromEntries(
  ACCOUNT_GLYPHS.map((g) => [g.text, g]),
)

export function matchAccountChip(acct: string): AccountChipMatch | null {
  const segments = acct.split(':')
  let depth = segments.length
  while (depth >= 1) {
    const prefix = segments.slice(0, depth).join(':')
    if (GLYPH_BY_TEXT[prefix]) break
    depth--
  }
  if (depth < 1) return null
  const glyph = GLYPH_BY_TEXT[segments.slice(0, depth).join(':')]
  const tail = segments.slice(depth)
  if (tail.length > 0 && /^\d+$/.test(tail[tail.length - 1])) tail.pop()
  const chipLabel = tail.length > 0 ? tail.join(' ') : glyph.chipLabel
  return { glyph, consumedLen: acct.length, chipLabel }
}

export function matchExpenseChip(acct: string): ExpenseChipMatch | null {
  const segments = acct.split(':')
  if (segments[0] !== 'Expenses' || segments.length < 2) return null
  let depth = segments.length
  while (depth >= 1) {
    const prefix = segments.slice(0, depth).join(':')
    if (EXPENSE_CATEGORIES[prefix]) break
    depth--
  }
  if (depth < 1) return null
  const matchedPath = segments.slice(0, depth).join(':')
  if (depth === segments.length) {
    return {
      matchedPath,
      consumedLen: acct.length,
      chipLabel: EXPENSE_CATEGORIES[matchedPath].shortName,
    }
  }
  const firstTail = segments[depth]
  return {
    matchedPath,
    consumedLen: matchedPath.length + 1 + firstTail.length,
    chipLabel: firstTail,
  }
}

function chipVisualWidth(chipLabel: string): number {
  return chipLabel.length + 3
}

export { chipVisualWidth }

export function visualTextLen(s: string): number {
  let delta = 0
  for (const match of s.matchAll(ANY_ACCOUNT_RE)) {
    const acct = match[0]
    if (acct.startsWith('Expenses:')) {
      const hit = matchExpenseChip(acct)
      if (!hit) continue
      delta += chipVisualWidth(hit.chipLabel) - hit.consumedLen
      continue
    }
    const hit = matchAccountChip(acct)
    if (!hit) continue
    delta += chipVisualWidth(hit.chipLabel) - hit.consumedLen
  }
  return s.length + delta
}
