import { resolveAccount } from '@/lib/beancount/entities/accounts'
import type { ParsedTxn } from '@/lib/beancount/parse'

const ICONS: Record<string, string> = {
  utensils:
    '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Z"/>',
  fuel:
    '<line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
  luggage:
    '<path d="M6 20a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2"/><path d="M8 18V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14"/><circle cx="8" cy="20" r="2"/><circle cx="16" cy="20" r="2"/>',
  plane:
    '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1 .5-3 1-4.5 2.5L13 9l-8-2-2 2 6 4-3 3H4l-2 2 4 1 1 4 2-2v-3l3-3 4 6 2-2z"/>',
  car:
    '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L15 9l-4-5H4.5a2 2 0 0 0-1.8 1.1L2 7h13l5 4v5z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  house: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  'shopping-bag':
    '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  'shopping-cart':
    '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
  tv: '<rect width="20" height="15" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  sparkles:
    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  award:
    '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  scale:
    '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  'credit-card':
    '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  'trending-down':
    '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  'arrow-left-right':
    '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  receipt:
    '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/>',
}

function pickExpenseIcon(leaf: string): string {
  const l = leaf.toLowerCase()
  if (l.startsWith('food:coffee') || l === 'food' || l.startsWith('food:'))
    return l.includes('grocer') ? 'shopping-cart' : 'utensils'
  if (l.startsWith('groceries')) return 'shopping-cart'
  if (l.startsWith('fuel')) return 'fuel'
  if (l.startsWith('travel:hotels') || l.startsWith('travel:hotel')) return 'luggage'
  if (l.startsWith('travel:flights') || l.startsWith('travel:flight')) return 'plane'
  if (l.startsWith('travel') || l.startsWith('transport')) return 'car'
  if (l.startsWith('rent') || l.startsWith('housing') || l.startsWith('home')) return 'house'
  if (l.startsWith('shopping')) return 'shopping-bag'
  if (l.startsWith('entertainment:books') || l.startsWith('books')) return 'book'
  if (l.startsWith('entertainment') || l.startsWith('subscriptions')) return 'tv'
  return 'receipt'
}

export function pickCategoryIcon(txn: Pick<ParsedTxn, 'postings'>): string | null {
  let hasRewardsPoints = false
  let hasRewardsStatus = false
  let hasIncomeVoid = false
  let hasExpenseVoid = false
  let expenseLeaf: string | null = null

  for (const posting of txn.postings) {
    const resolved = resolveAccount(posting.account)
    if (!resolved) continue
    if (resolved.matchedPath === 'Assets:Rewards:Points') hasRewardsPoints = true
    else if (resolved.matchedPath === 'Assets:Rewards:Status') hasRewardsStatus = true
    else if (posting.account === 'Income:Void') hasIncomeVoid = true
    else if (posting.account === 'Expenses:Void') hasExpenseVoid = true
    else if (resolved.matchedPath.startsWith('Expenses') && expenseLeaf === null) {
      expenseLeaf = resolved.matchedPath.slice('Expenses:'.length)
    }
  }

  if (hasRewardsStatus && hasExpenseVoid) return 'award'
  if (hasRewardsStatus) return 'award'
  if (hasRewardsPoints && hasExpenseVoid) return 'sparkles'
  if (hasRewardsPoints) return 'sparkles'
  if (hasIncomeVoid && !expenseLeaf) return 'trending-down'
  if (expenseLeaf) return pickExpenseIcon(expenseLeaf)
  return 'arrow-left-right'
}

export function renderIconSVG(key: string | null): string {
  if (!key) return ''
  const body = ICONS[key]
  if (!body) return ''
  return `<svg class="cm-txn-desc-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}
