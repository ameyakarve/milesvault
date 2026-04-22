import {
  Armchair,
  ArrowRightLeft,
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
  Home,
  Hotel,
  KeyRound,
  Lamp,
  Landmark,
  type LucideIcon,
  Luggage,
  Map,
  Milestone,
  Package,
  Palette,
  ParkingCircle,
  Pill,
  Plane,
  Plug,
  Receipt,
  Repeat,
  Shirt,
  ShieldPlus,
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
} from 'lucide-react'

export type CardColor = 'amber' | 'sky' | 'emerald' | 'rose' | 'indigo' | 'slate'

export type CategoryMeta = {
  fullName: string
  shortName: string
  icon: LucideIcon
  color: CardColor
}

const TOP_COLORS: Partial<Record<string, CardColor>> = {
  Food: 'amber',
  Transport: 'emerald',
  Housing: 'sky',
  Health: 'rose',
  Shopping: 'indigo',
  Gadgets: 'indigo',
  Entertainment: 'rose',
  Travel: 'emerald',
  Personal: 'sky',
  Services: 'slate',
  Taxes: 'slate',
  Rewards: 'sky',
  Misc: 'slate',
}

function cat(
  icon: LucideIcon,
  shortName: string,
  fullName: string,
  color: CardColor,
): CategoryMeta {
  return { icon, shortName, fullName, color }
}

function colorForExpensePath(path: string): CardColor {
  const parts = path.split(':')
  if (parts[0] !== 'Expenses') return 'slate'
  return TOP_COLORS[parts[1] ?? ''] ?? 'slate'
}

export const EXPENSE_CATEGORIES: Record<string, CategoryMeta> = {
  Expenses: cat(Wallet, 'Expense', 'Expense', 'slate'),

  'Expenses:Food': cat(Utensils, 'Dining', 'Food', 'amber'),
  'Expenses:Food:Coffee': cat(Coffee, 'Coffee', 'Food · Coffee', 'amber'),
  'Expenses:Food:Groceries': cat(ShoppingBasket, 'Groceries', 'Food · Groceries', 'amber'),
  'Expenses:Food:Delivery': cat(Bike, 'Delivery', 'Food · Delivery', 'amber'),
  'Expenses:Food:Snacks': cat(Cookie, 'Snacks', 'Food · Snacks', 'amber'),
  'Expenses:Food:Restaurant': cat(UtensilsCrossed, 'Restaurant', 'Food · Restaurant', 'amber'),
  'Expenses:Food:Dining': cat(UtensilsCrossed, 'Dining Out', 'Food · Dining Out', 'amber'),

  'Expenses:Transport': cat(Car, 'Transport', 'Transport', 'emerald'),
  'Expenses:Transport:Fuel': cat(Fuel, 'Fuel', 'Transport · Fuel', 'emerald'),
  'Expenses:Transport:Transit': cat(TrainFront, 'Transit', 'Transport · Transit', 'emerald'),
  'Expenses:Transport:Rideshare': cat(Car, 'Rideshare', 'Transport · Rideshare', 'emerald'),
  'Expenses:Transport:Tolls': cat(Milestone, 'Tolls', 'Transport · Tolls', 'emerald'),
  'Expenses:Transport:Parking': cat(ParkingCircle, 'Parking', 'Transport · Parking', 'emerald'),

  'Expenses:Housing': cat(Home, 'Housing', 'Housing', 'sky'),
  'Expenses:Housing:Rent': cat(KeyRound, 'Rent', 'Housing · Rent', 'sky'),
  'Expenses:Housing:Utilities': cat(Plug, 'Utilities', 'Housing · Utilities', 'sky'),
  'Expenses:Housing:Utilities:Electricity': cat(Zap, 'Electricity', 'Housing · Electricity', 'sky'),
  'Expenses:Housing:Utilities:Water': cat(Droplets, 'Water', 'Housing · Water', 'sky'),
  'Expenses:Housing:Utilities:Gas': cat(Flame, 'Gas', 'Housing · Gas', 'sky'),
  'Expenses:Housing:Utilities:Internet': cat(Wifi, 'Internet', 'Housing · Internet', 'sky'),
  'Expenses:Housing:Maintenance': cat(Wrench, 'Maintenance', 'Housing · Maintenance', 'sky'),
  'Expenses:Housing:Furniture': cat(Armchair, 'Furniture', 'Housing · Furniture', 'sky'),

  'Expenses:Health': cat(Stethoscope, 'Health', 'Health', 'rose'),
  'Expenses:Health:Pharmacy': cat(Pill, 'Pharmacy', 'Health · Pharmacy', 'rose'),
  'Expenses:Health:Insurance': cat(ShieldPlus, 'Insurance', 'Health · Insurance', 'rose'),
  'Expenses:Health:Fitness': cat(Dumbbell, 'Fitness', 'Health · Fitness', 'rose'),

  'Expenses:Shopping': cat(ShoppingBag, 'Shopping', 'Shopping', 'indigo'),
  'Expenses:Shopping:Clothing': cat(Shirt, 'Clothing', 'Shopping · Clothing', 'indigo'),
  'Expenses:Shopping:Electronics': cat(Cpu, 'Electronics', 'Shopping · Electronics', 'indigo'),
  'Expenses:Shopping:Home': cat(Lamp, 'Home Goods', 'Shopping · Home Goods', 'indigo'),
  'Expenses:Shopping:Personal': cat(Sparkles, 'Personal', 'Shopping · Personal', 'indigo'),
  'Expenses:Gadgets': cat(Cpu, 'Gadgets', 'Gadgets', 'indigo'),

  'Expenses:Entertainment': cat(Ticket, 'Leisure', 'Entertainment', 'rose'),
  'Expenses:Entertainment:Streaming': cat(Tv, 'Streaming', 'Entertainment · Streaming', 'rose'),
  'Expenses:Entertainment:Books': cat(Book, 'Books', 'Entertainment · Books', 'rose'),
  'Expenses:Entertainment:Games': cat(Gamepad2, 'Games', 'Entertainment · Games', 'rose'),
  'Expenses:Entertainment:Hobbies': cat(Palette, 'Hobbies', 'Entertainment · Hobbies', 'rose'),

  'Expenses:Travel': cat(Luggage, 'Travel', 'Travel', 'emerald'),
  'Expenses:Travel:Hotels': cat(Hotel, 'Hotels', 'Travel · Hotels', 'emerald'),
  'Expenses:Travel:Flights': cat(Plane, 'Flights', 'Travel · Flights', 'emerald'),
  'Expenses:Travel:Tours': cat(Map, 'Tours', 'Travel · Tours', 'emerald'),
  'Expenses:Travel:Local': cat(Bus, 'Local', 'Travel · Local', 'emerald'),
  'Expenses:Travel:Rideshare': cat(Car, 'Rideshare', 'Travel · Rideshare', 'emerald'),
  'Expenses:Travel:Museums': cat(Palette, 'Museums', 'Travel · Museums', 'emerald'),
  'Expenses:Travel:Visas': cat(FileText, 'Visas', 'Travel · Visas', 'emerald'),

  'Expenses:Personal': cat(User, 'Personal', 'Personal', 'sky'),
  'Expenses:Personal:Education': cat(GraduationCap, 'Education', 'Personal · Education', 'sky'),
  'Expenses:Personal:Gifts': cat(Gift, 'Gifts', 'Personal · Gifts', 'sky'),
  'Expenses:Personal:Charity': cat(HandHeart, 'Charity', 'Personal · Charity', 'sky'),
  'Expenses:Personal:Family': cat(Users, 'Family', 'Personal · Family', 'sky'),

  'Expenses:Services': cat(Briefcase, 'Services', 'Services', 'slate'),
  'Expenses:Services:Subscriptions': cat(Repeat, 'Subs', 'Services · Subscriptions', 'slate'),
  'Expenses:Services:Banking': cat(Landmark, 'Banking', 'Services · Banking', 'slate'),
  'Expenses:Services:Shipping': cat(Package, 'Shipping', 'Services · Shipping', 'slate'),

  'Expenses:Rewards': cat(Sparkles, 'Rewards', 'Rewards', 'sky'),
  'Expenses:Taxes': cat(Receipt, 'Taxes', 'Taxes', 'slate'),
  'Expenses:Misc': cat(CircleEllipsis, 'Misc', 'Misc', 'slate'),
}

export const TRANSFER_CATEGORY: CategoryMeta = cat(
  ArrowRightLeft,
  'Transfer',
  'Transfer',
  'slate',
)
export const FALLBACK_CATEGORY: CategoryMeta = cat(Wallet, 'Misc', 'Misc', 'slate')

export function categoryForAccount(account: string): CategoryMeta | null {
  const parts = account.split(':')
  for (let i = parts.length; i > 0; i--) {
    const key = parts.slice(0, i).join(':')
    const hit = EXPENSE_CATEGORIES[key]
    if (hit) return hit
  }
  return null
}

export function categoryForTxn(accounts: readonly string[]): CategoryMeta {
  const expenses = accounts.filter((a) => a === 'Expenses' || a.startsWith('Expenses:'))
  if (expenses.length > 0) {
    const prefix = longestCommonAccountPrefix(expenses)
    const hit = categoryForAccount(prefix)
    if (hit) return hit
    const color = colorForExpensePath(prefix)
    return { ...FALLBACK_CATEGORY, color }
  }
  const onlyTransfers = accounts.every(
    (a) => a.startsWith('Assets:') || a.startsWith('Liabilities:'),
  )
  if (onlyTransfers && accounts.length >= 2) return TRANSFER_CATEGORY
  return FALLBACK_CATEGORY
}

function longestCommonAccountPrefix(accounts: readonly string[]): string {
  if (accounts.length === 0) return ''
  const first = accounts[0].split(':')
  let depth = first.length
  for (let i = 1; i < accounts.length; i++) {
    const parts = accounts[i].split(':')
    let j = 0
    while (j < depth && j < parts.length && first[j] === parts[j]) j++
    depth = j
    if (depth === 0) break
  }
  return first.slice(0, depth).join(':')
}

export const EXPENSE_ICONS: Record<string, LucideIcon> = Object.fromEntries(
  Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => [k, v.icon]),
)

export const DEFAULT_ICON: LucideIcon = FALLBACK_CATEGORY.icon
export const TRANSFER_ICON: LucideIcon = TRANSFER_CATEGORY.icon

export function iconForAccount(account: string): LucideIcon | null {
  return categoryForAccount(account)?.icon ?? null
}

export function iconForTxn(accounts: readonly string[]): LucideIcon {
  return categoryForTxn(accounts).icon
}
