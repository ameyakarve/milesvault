export const TOP_LEVELS = ['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses'] as const

export function splitCamel(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
}

export function shortAccountName(path: string): string {
  const parts = path.split(':').filter(Boolean)
  if (parts.length === 0) return path
  const rest = (TOP_LEVELS as readonly string[]).includes(parts[0]) ? parts.slice(1) : parts
  const tail = rest.length >= 2 ? rest.slice(-2) : rest
  return tail.map(splitCamel).join(' ')
}
