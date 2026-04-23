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

const EXPENSE_ACCOUNT_RE = /Expenses(?::[A-Za-z0-9]+)+/g

export type ExpenseChipMatch = {
  matchedPath: string
  consumedLen: number
  chipLabel: string
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
  for (const g of ACCOUNT_GLYPHS) {
    if (g.text.length === 0) continue
    let idx = 0
    while ((idx = s.indexOf(g.text, idx)) !== -1) {
      delta += g.visualWidth - g.text.length
      idx += g.text.length
    }
  }
  for (const match of s.matchAll(EXPENSE_ACCOUNT_RE)) {
    const hit = matchExpenseChip(match[0])
    if (!hit) continue
    delta += chipVisualWidth(hit.chipLabel) - hit.consumedLen
  }
  return s.length + delta
}
