import {
  Armchair,
  Bike,
  Book,
  Briefcase,
  Bus,
  Car,
  CircleEllipsis,
  Coffee,
  Cookie,
  Cpu,
  Droplets,
  Dumbbell,
  FileText,
  Flame,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandHeart,
  Hotel,
  House,
  KeyRound,
  Lamp,
  Landmark,
  Luggage,
  Map as MapIcon,
  Milestone,
  Package,
  Palette,
  ParkingCircle,
  Pill,
  Plane,
  Plug,
  Receipt,
  Repeat,
  ShieldPlus,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Stethoscope,
  Ticket,
  TrainFront,
  Tv,
  User,
  Users,
  Utensils,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-static'

const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'
const SVG_CLOSE = '</svg>'

const CC_SVG = `${SVG_OPEN}<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>${SVG_CLOSE}`
const DC_SVG = `${SVG_OPEN}<rect width="20" height="14" x="2" y="5" rx="2" stroke-dasharray="2.5 2"/>${SVG_CLOSE}`
const PREPAID_SVG = `${SVG_OPEN}<rect width="20" height="14" x="2" y="5" rx="2"/><circle cx="17" cy="14" r="2"/>${SVG_CLOSE}`
const FOREX_SVG = `${SVG_OPEN}<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>${SVG_CLOSE}`
const BANK_SVG = `${SVG_OPEN}<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>${SVG_CLOSE}`
const POINTS_SVG = `${SVG_OPEN}<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>${SVG_CLOSE}`
const STATUS_SVG = `${SVG_OPEN}<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.5"/>${SVG_CLOSE}`
const WALLET_SVG = `${SVG_OPEN}<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>${SVG_CLOSE}`
const GIFT_SVG = `${SVG_OPEN}<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>${SVG_CLOSE}`
const RECEIVABLE_SVG = `${SVG_OPEN}<path d="M11 17a1 1 0 0 1-1.414 0L6 13.414A2 2 0 0 1 6 10.586l3.586-3.586a1 1 0 1 1 1.414 1.414L8.414 11H17a4 4 0 0 1 4 4v2a1 1 0 1 1-2 0v-2a2 2 0 0 0-2-2H8.414l2.586 2.586A1 1 0 0 1 11 17Z"/>${SVG_CLOSE}`
const CASH_SVG = `${SVG_OPEN}<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01"/><path d="M18 12h.01"/>${SVG_CLOSE}`
const VOID_SVG = `${SVG_OPEN}<circle cx="12" cy="12" r="8" stroke-dasharray="3 2.5"/>${SVG_CLOSE}`

export type Glyph = {
  svg: string
  label: string
  chipLabel: string
}

export type AccountNode = {
  segment: string
  glyph?: Glyph
  prefixChip?: boolean
  defaultCurrency?: string
  color?: string
  children: Record<string, AccountNode>
}

type NodeSpec = {
  path: string
  glyph?: Glyph
  prefixChip?: boolean
  defaultCurrency?: string
  color?: string
}

function n(path: string, meta: Omit<NodeSpec, 'path'> = {}): NodeSpec {
  return { path, ...meta }
}

function g(svg: string, label: string, chipLabel: string): Glyph {
  return { svg, label, chipLabel }
}

const NODES: readonly NodeSpec[] = [
  // Assets
  n('Assets'),
  n('Assets:Cash', { glyph: g(CASH_SVG, 'cash', 'Cash') }),
  n('Assets:Bank', { glyph: g(BANK_SVG, 'bank', 'Bank') }),
  n('Assets:DC', { glyph: g(DC_SVG, 'debit card', 'DC') }),
  n('Assets:Receivables', { glyph: g(RECEIVABLE_SVG, 'receivable', 'Rcv') }),
  n('Assets:Loaded'),
  n('Assets:Loaded:PrepaidCards', { glyph: g(PREPAID_SVG, 'prepaid card', 'PP') }),
  n('Assets:Loaded:ForexCards', { glyph: g(FOREX_SVG, 'forex card', 'FX') }),
  n('Assets:Loaded:Wallets', { glyph: g(WALLET_SVG, 'wallet', 'Wallet') }),
  n('Assets:Loaded:GiftCards', { glyph: g(GIFT_SVG, 'gift card', 'Gift') }),
  n('Assets:Rewards'),
  n('Assets:Rewards:Points', { glyph: g(POINTS_SVG, 'rewards points', 'Points') }),
  n('Assets:Rewards:Status', {
    glyph: g(STATUS_SVG, 'status tier', 'Status'),
    prefixChip: true,
  }),

  // Liabilities
  n('Liabilities'),
  n('Liabilities:CC', { glyph: g(CC_SVG, 'credit card', 'CC') }),
  n('Liabilities:Loans'),

  // Income
  n('Income'),
  n('Income:Salary'),
  n('Income:Interest'),
  n('Income:Void', { glyph: g(VOID_SVG, 'void (source)', 'Void') }),

  // Equity
  n('Equity'),
  n('Equity:Opening-Balances'),

  // Expenses
  n('Expenses', { glyph: g(Wallet, 'expense', 'Expense'), color: 'slate' }),
  n('Expenses:Food', { glyph: g(Utensils, 'food', 'Dining'), color: 'amber' }),
  n('Expenses:Food:Coffee', { glyph: g(Coffee, 'coffee', 'Coffee'), color: 'amber' }),
  n('Expenses:Food:Groceries', {
    glyph: g(ShoppingBasket, 'groceries', 'Groceries'),
    color: 'amber',
  }),
  n('Expenses:Food:Delivery', { glyph: g(Bike, 'delivery', 'Delivery'), color: 'amber' }),
  n('Expenses:Food:Snacks', { glyph: g(Cookie, 'snacks', 'Snacks'), color: 'amber' }),
  n('Expenses:Food:Restaurant', {
    glyph: g(UtensilsCrossed, 'restaurant', 'Restaurant'),
    color: 'amber',
  }),
  n('Expenses:Food:Dining', {
    glyph: g(UtensilsCrossed, 'dining out', 'Dining Out'),
    color: 'amber',
  }),

  n('Expenses:Transport', { glyph: g(Car, 'transport', 'Transport'), color: 'emerald' }),
  n('Expenses:Transport:Fuel', { glyph: g(Fuel, 'fuel', 'Fuel'), color: 'emerald' }),
  n('Expenses:Transport:Transit', {
    glyph: g(TrainFront, 'transit', 'Transit'),
    color: 'emerald',
  }),
  n('Expenses:Transport:Rideshare', {
    glyph: g(Car, 'rideshare', 'Rideshare'),
    color: 'emerald',
  }),
  n('Expenses:Transport:Tolls', {
    glyph: g(Milestone, 'tolls', 'Tolls'),
    color: 'emerald',
  }),
  n('Expenses:Transport:Parking', {
    glyph: g(ParkingCircle, 'parking', 'Parking'),
    color: 'emerald',
  }),

  n('Expenses:Housing', { glyph: g(House, 'housing', 'Housing'), color: 'sky' }),
  n('Expenses:Housing:Rent', { glyph: g(KeyRound, 'rent', 'Rent'), color: 'sky' }),
  n('Expenses:Housing:Utilities', { glyph: g(Plug, 'utilities', 'Utilities'), color: 'sky' }),
  n('Expenses:Housing:Utilities:Electricity', {
    glyph: g(Zap, 'electricity', 'Electricity'),
    color: 'sky',
  }),
  n('Expenses:Housing:Utilities:Water', {
    glyph: g(Droplets, 'water', 'Water'),
    color: 'sky',
  }),
  n('Expenses:Housing:Utilities:Gas', { glyph: g(Flame, 'gas', 'Gas'), color: 'sky' }),
  n('Expenses:Housing:Utilities:Internet', {
    glyph: g(Wifi, 'internet', 'Internet'),
    color: 'sky',
  }),
  n('Expenses:Housing:Maintenance', {
    glyph: g(Wrench, 'maintenance', 'Maintenance'),
    color: 'sky',
  }),
  n('Expenses:Housing:Furniture', {
    glyph: g(Armchair, 'furniture', 'Furniture'),
    color: 'sky',
  }),

  n('Expenses:Health', { glyph: g(Stethoscope, 'health', 'Health'), color: 'rose' }),
  n('Expenses:Health:Pharmacy', { glyph: g(Pill, 'pharmacy', 'Pharmacy'), color: 'rose' }),
  n('Expenses:Health:Insurance', {
    glyph: g(ShieldPlus, 'insurance', 'Insurance'),
    color: 'rose',
  }),
  n('Expenses:Health:Fitness', {
    glyph: g(Dumbbell, 'fitness', 'Fitness'),
    color: 'rose',
  }),

  n('Expenses:Shopping', {
    glyph: g(ShoppingBag, 'shopping', 'Shopping'),
    color: 'indigo',
  }),
  n('Expenses:Shopping:Clothing', {
    glyph: g(Shirt, 'clothing', 'Clothing'),
    color: 'indigo',
  }),
  n('Expenses:Shopping:Electronics', {
    glyph: g(Cpu, 'electronics', 'Electronics'),
    color: 'indigo',
  }),
  n('Expenses:Shopping:Home', {
    glyph: g(Lamp, 'home goods', 'Home Goods'),
    color: 'indigo',
  }),
  n('Expenses:Shopping:Personal', {
    glyph: g(Sparkles, 'personal', 'Personal'),
    color: 'indigo',
  }),
  n('Expenses:Gadgets', { glyph: g(Cpu, 'gadgets', 'Gadgets'), color: 'indigo' }),

  n('Expenses:Entertainment', {
    glyph: g(Ticket, 'entertainment', 'Leisure'),
    color: 'rose',
  }),
  n('Expenses:Entertainment:Streaming', {
    glyph: g(Tv, 'streaming', 'Streaming'),
    color: 'rose',
  }),
  n('Expenses:Entertainment:Books', {
    glyph: g(Book, 'books', 'Books'),
    color: 'rose',
  }),
  n('Expenses:Entertainment:Games', {
    glyph: g(Gamepad2, 'games', 'Games'),
    color: 'rose',
  }),
  n('Expenses:Entertainment:Hobbies', {
    glyph: g(Palette, 'hobbies', 'Hobbies'),
    color: 'rose',
  }),

  n('Expenses:Travel', { glyph: g(Luggage, 'travel', 'Travel'), color: 'emerald' }),
  n('Expenses:Travel:Hotels', { glyph: g(Hotel, 'hotels', 'Hotels'), color: 'emerald' }),
  n('Expenses:Travel:Flights', {
    glyph: g(Plane, 'flights', 'Flights'),
    color: 'emerald',
  }),
  n('Expenses:Travel:Tours', {
    glyph: g(MapIcon, 'tours', 'Tours'),
    color: 'emerald',
  }),
  n('Expenses:Travel:Local', { glyph: g(Bus, 'local', 'Local'), color: 'emerald' }),
  n('Expenses:Travel:Rideshare', {
    glyph: g(Car, 'rideshare', 'Rideshare'),
    color: 'emerald',
  }),
  n('Expenses:Travel:Museums', {
    glyph: g(Palette, 'museums', 'Museums'),
    color: 'emerald',
  }),
  n('Expenses:Travel:Visas', {
    glyph: g(FileText, 'visas', 'Visas'),
    color: 'emerald',
  }),

  n('Expenses:Personal', { glyph: g(User, 'personal', 'Personal'), color: 'sky' }),
  n('Expenses:Personal:Education', {
    glyph: g(GraduationCap, 'education', 'Education'),
    color: 'sky',
  }),
  n('Expenses:Personal:Gifts', { glyph: g(Gift, 'gifts', 'Gifts'), color: 'sky' }),
  n('Expenses:Personal:Charity', {
    glyph: g(HandHeart, 'charity', 'Charity'),
    color: 'sky',
  }),
  n('Expenses:Personal:Family', { glyph: g(Users, 'family', 'Family'), color: 'sky' }),

  n('Expenses:Services', {
    glyph: g(Briefcase, 'services', 'Services'),
    color: 'slate',
  }),
  n('Expenses:Services:Subscriptions', {
    glyph: g(Repeat, 'subscriptions', 'Subs'),
    color: 'slate',
  }),
  n('Expenses:Services:Banking', {
    glyph: g(Landmark, 'banking', 'Banking'),
    color: 'slate',
  }),
  n('Expenses:Services:Shipping', {
    glyph: g(Package, 'shipping', 'Shipping'),
    color: 'slate',
  }),

  n('Expenses:Void', { glyph: g(Sparkles, 'void', 'Void'), color: 'sky' }),
  n('Expenses:Taxes', { glyph: g(Receipt, 'taxes', 'Taxes'), color: 'slate' }),
  n('Expenses:Misc', { glyph: g(CircleEllipsis, 'misc', 'Misc'), color: 'slate' }),
]

function buildTree(specs: readonly NodeSpec[]): AccountNode {
  const root: AccountNode = { segment: '', children: {} }
  for (const spec of specs) {
    const parts = spec.path.split(':')
    let node = root
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i]
      if (!node.children[seg]) {
        node.children[seg] = { segment: seg, children: {} }
      }
      node = node.children[seg]
      if (i === parts.length - 1) {
        if (spec.glyph) node.glyph = spec.glyph
        if (spec.prefixChip !== undefined) node.prefixChip = spec.prefixChip
        if (spec.defaultCurrency !== undefined) node.defaultCurrency = spec.defaultCurrency
        if (spec.color !== undefined) node.color = spec.color
      }
    }
  }
  return root
}

export const ACCOUNT_TREE: AccountNode = buildTree(NODES)

export type ResolvedAccount = {
  matchedDepth: number
  matchedPath: string
  tail: readonly string[]
  consumedLen: number
  chipLabel: string
  glyph: Glyph | null
  color: string | null
  defaultCurrency: string | null
  prefixChip: boolean
}

export function resolveAccount(path: string): ResolvedAccount | null {
  const segments = path.split(':')
  if (segments.length < 2 || !segments[0]) return null
  let node: AccountNode = ACCOUNT_TREE
  let glyph: Glyph | null = null
  let color: string | null = null
  let defaultCurrency: string | null = null
  let depth = 0
  for (const seg of segments) {
    const child = node.children[seg]
    if (!child) break
    node = child
    if (child.glyph) glyph = child.glyph
    if (child.color !== undefined) color = child.color
    if (child.defaultCurrency !== undefined) defaultCurrency = child.defaultCurrency
    depth++
  }
  if (depth === 0) return null
  const matchedPath = segments.slice(0, depth).join(':')
  const tail = segments.slice(depth)
  const prefixChip = node.prefixChip ?? false
  let chipLabel: string
  if (tail.length === 0) {
    chipLabel = glyph?.chipLabel ?? matchedPath
  } else {
    const tailStr = tail.join(' ')
    chipLabel = prefixChip && glyph ? `${glyph.chipLabel}: ${tailStr}` : tailStr
  }
  return {
    matchedDepth: depth,
    matchedPath,
    tail,
    consumedLen: path.length,
    chipLabel,
    glyph,
    color,
    defaultCurrency,
    prefixChip,
  }
}

function collectPaths(node: AccountNode, prefix: string, out: string[]): void {
  for (const seg of Object.keys(node.children)) {
    const child = node.children[seg]
    const p = prefix ? `${prefix}:${seg}` : seg
    out.push(p)
    collectPaths(child, p, out)
  }
}

export const ALL_ACCOUNTS: readonly string[] = (() => {
  const out: string[] = []
  collectPaths(ACCOUNT_TREE, '', out)
  return out.sort()
})()

export type AccountCompleter = (prefix: string) => readonly string[]

export const completeAccount: AccountCompleter = (prefix) => {
  if (!prefix) return ALL_ACCOUNTS
  return ALL_ACCOUNTS.filter((a) => a.startsWith(prefix))
}
