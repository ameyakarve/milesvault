export type Currency = {
  code: string
  symbol: string
  precision: number
  locale?: string
}

export const CURRENCIES: Record<string, Currency> = {
  INR: { code: 'INR', symbol: '₹', precision: 2, locale: 'en-IN' },
  USD: { code: 'USD', symbol: '$', precision: 2, locale: 'en-US' },
  EUR: { code: 'EUR', symbol: '€', precision: 2 },
  GBP: { code: 'GBP', symbol: '£', precision: 2 },
  AED: { code: 'AED', symbol: 'د.إ', precision: 2 },
  SGD: { code: 'SGD', symbol: 'S$', precision: 2 },
  JPY: { code: 'JPY', symbol: '¥', precision: 0 },
}

export function getCurrency(code: string): Currency | null {
  return CURRENCIES[code] ?? null
}
