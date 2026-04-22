const TOP_LEVELS = new Set(['Assets', 'Liabilities', 'Expenses', 'Income', 'Equity'])
export const CREDIT_CARD_GROUPS = new Set(['CC'])

export function accountDisplayName(path: string): string {
  const parts = path.split(':').filter(Boolean)
  if (parts.length === 0) return path

  const rest = TOP_LEVELS.has(parts[0]) ? parts.slice(1) : parts

  if (rest.length > 0 && CREDIT_CARD_GROUPS.has(rest[0])) {
    const [, bank, card, numberId] = rest
    const base = bank && card ? `${bank} ${card}` : bank ? bank : 'Card'
    return numberId ? `${base} · ${numberId}` : base
  }

  return rest.join(':')
}

export function paymentMethodDisplay(path: string): string | null {
  const parts = path.split(':').filter(Boolean)
  if (parts.length < 2) return null
  const [root, group, a, b, extra] = parts

  if (root === 'Liabilities' && CREDIT_CARD_GROUPS.has(group)) {
    const base = a && b ? `${a} ${b}` : a ? a : null
    if (!base) return null
    return extra ? `${base} · ${extra}` : base
  }

  if (root === 'Assets') {
    if (parts.length === 2 && group === 'Cash') return 'Cash'
    if (group === 'Bank') {
      if (extra) return null
      if (a && b) return `${a} ${b}`
      if (a) return a
    }
  }

  return null
}
