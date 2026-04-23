import { EXPENSE_ICONS } from './category-icons'

const ROOTS = [
  'Assets',
  'Assets:Bank',
  'Assets:Cash',
  'Assets:DebitCards',
  'Assets:Loaded',
  'Assets:Loaded:Wallets',
  'Assets:Loaded:PrepaidCards',
  'Assets:Loaded:GiftCards',
  'Assets:Loaded:ForexCards',
  'Assets:Rewards',
  'Assets:Rewards:Points',
  'Assets:Rewards:Status',
  'Liabilities',
  'Liabilities:CC',
  'Liabilities:Loans',
  'Income',
  'Income:Salary',
  'Income:Interest',
  'Income:Void',
  'Expenses:Void',
  'Equity',
  'Equity:Opening-Balances',
]

export const ALL_ACCOUNTS: readonly string[] = Array.from(
  new Set([...ROOTS, ...Object.keys(EXPENSE_ICONS)]),
).sort()

export type AccountCompleter = (prefix: string) => readonly string[]

export const completeAccount: AccountCompleter = (prefix) => {
  if (!prefix) return ALL_ACCOUNTS
  return ALL_ACCOUNTS.filter((a) => a.startsWith(prefix))
}
