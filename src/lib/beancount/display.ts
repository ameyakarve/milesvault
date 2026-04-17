export type DisplayDate =
  | { kind: 'recent'; label: string }
  | { kind: 'date'; month: string; day: string; year: string | null }

export function formatDate(
  year: number,
  month: number,
  day: number,
  now: Date = new Date(),
): DisplayDate {
  const txn = new Date(Date.UTC(year, month - 1, day))
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const diffDays = Math.round((today.getTime() - txn.getTime()) / 86400000)

  if (diffDays === 0) return { kind: 'recent', label: 'Today' }
  if (diffDays === 1) return { kind: 'recent', label: 'Yesterday' }
  if (diffDays > 1 && diffDays < 7) {
    return {
      kind: 'recent',
      label: txn.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    }
  }
  const monthStr = txn.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const dayStr = String(day)
  const sameYear = txn.getUTCFullYear() === today.getUTCFullYear()
  return { kind: 'date', month: monthStr, day: dayStr, year: sameYear ? null : String(year) }
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
  const isInr = currency === 'INR'
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '−' : amount > 0 ? '+' : ''
  const hasDecimals = Math.round(abs * 100) % 100 !== 0
  const body = isInr
    ? formatInr(abs, hasDecimals)
    : abs.toLocaleString('en-US', {
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: 2,
      })
  return `${sign}${symbol}${body}`
}

function formatInr(n: number, hasDecimals: boolean): string {
  const fixed = n.toFixed(hasDecimals ? 2 : 0)
  const [integer, decimal] = fixed.split('.')
  const grouped =
    integer.length <= 3
      ? integer
      : integer.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + integer.slice(-3)
  return decimal ? `${grouped}.${decimal}` : grouped
}

const TOP_LEVELS = new Set(['Assets', 'Liabilities', 'Expenses', 'Income', 'Equity'])
const GROUP_LABELS = new Set(['CreditCards', 'CreditCard', 'Bank', 'Banking', 'Accounts'])
const SUB_BUCKETS = new Set(['Cashback', 'Rewards', 'Points', 'Miles'])

export function humanizeAccount(path: string): string {
  const parts = path.split(':').filter(Boolean)
  if (parts.length === 0) return path

  const hasCreditCard = parts.some((p) => p === 'CreditCards' || p === 'CreditCard')

  const meaningful = parts.filter(
    (p) => !TOP_LEVELS.has(p) && !GROUP_LABELS.has(p) && !SUB_BUCKETS.has(p),
  )
  const label = meaningful.map(prettyCase).join(' ')
  if (hasCreditCard) return label ? `${label} Credit Card` : 'Credit Card'
  return label || prettyCase(parts[parts.length - 1])
}

function prettyCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
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
