const TOP_LEVELS = new Set(['Assets', 'Liabilities', 'Expenses', 'Income', 'Equity'])
export const CREDIT_CARD_GROUPS = new Set(['CreditCards', 'CreditCard'])

export function accountDisplayName(path: string): string {
  const parts = path.split(':').filter(Boolean)
  if (parts.length === 0) return path

  const rest = TOP_LEVELS.has(parts[0]) ? parts.slice(1) : parts

  if (rest.length > 0 && CREDIT_CARD_GROUPS.has(rest[0])) {
    const [, bank, card] = rest
    if (bank && card) return `${bank} ${card} Card`
    if (bank) return `${bank} Card`
    return 'Card'
  }

  return rest.join(':')
}
