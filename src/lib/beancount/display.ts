export type DisplayDate = { month: string; day: string }

export function formatDate(year: number, month: number, day: number): DisplayDate {
  const txn = new Date(Date.UTC(year, month - 1, day))
  const monthStr = txn.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return { month: monthStr, day: String(day) }
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
}

export function formatAmount(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '−' : amount > 0 ? '+' : ''
  const hasDecimals = Math.round(abs * 100) % 100 !== 0
  const body = abs.toLocaleString('en-US', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })
  return `${sign}${symbol}${body}`
}


export type Category = { label: string; icon: string }

const CATEGORY_RULES: Array<{ pattern: RegExp; category: Category }> = [
  { pattern: /^Expenses:Food:(Coffee|Cafe|Tea)/, category: { label: 'Dining', icon: 'local_cafe' } },
  {
    pattern: /^Expenses:Food:(Groceries|Supermarket|Market)/,
    category: { label: 'Groceries', icon: 'local_grocery_store' },
  },
  {
    pattern: /^Expenses:Food:(Restaurant|Dining|Takeout|Delivery)/,
    category: { label: 'Dining', icon: 'restaurant' },
  },
  { pattern: /^Expenses:Food/, category: { label: 'Food', icon: 'restaurant' } },
  {
    pattern: /^Expenses:Transport:(Cab|Taxi|Uber|Ola|Rideshare)/,
    category: { label: 'Cab', icon: 'local_taxi' },
  },
  {
    pattern: /^Expenses:Transport:(Fuel|Petrol|Gas|Diesel)/,
    category: { label: 'Fuel', icon: 'local_gas_station' },
  },
  {
    pattern: /^Expenses:Transport/,
    category: { label: 'Transport', icon: 'directions_bus' },
  },
  { pattern: /^Expenses:Shopping/, category: { label: 'Shopping', icon: 'shopping_bag' } },
  { pattern: /^Expenses:Entertainment/, category: { label: 'Entertainment', icon: 'movie' } },
  { pattern: /^Expenses:Bills:Electricity/, category: { label: 'Electricity', icon: 'bolt' } },
  { pattern: /^Expenses:Bills:Water/, category: { label: 'Water', icon: 'water_drop' } },
  {
    pattern: /^Expenses:Bills:(Internet|Wifi|Broadband)/,
    category: { label: 'Internet', icon: 'wifi' },
  },
  { pattern: /^Expenses:Bills:(Phone|Mobile)/, category: { label: 'Phone', icon: 'call' } },
  { pattern: /^Expenses:Bills/, category: { label: 'Bills', icon: 'receipt_long' } },
  { pattern: /^Expenses:Health/, category: { label: 'Health', icon: 'medical_services' } },
  { pattern: /^Expenses:(Rent|Housing|Home)/, category: { label: 'Home', icon: 'home' } },
  { pattern: /^Expenses:Travel:Flights/, category: { label: 'Flights', icon: 'flight' } },
  { pattern: /^Expenses:Travel:Hotels/, category: { label: 'Hotels', icon: 'hotel' } },
  { pattern: /^Expenses:Travel/, category: { label: 'Travel', icon: 'luggage' } },
  {
    pattern: /^Expenses:(Fees|Charges|Taxes|Tax)/,
    category: { label: 'Fees', icon: 'receipt' },
  },
  { pattern: /^Expenses:/, category: { label: 'Misc', icon: 'receipt_long' } },
]

export function categoryFromAccount(path: string): Category | null {
  for (const rule of CATEGORY_RULES) if (rule.pattern.test(path)) return rule.category
  return null
}
