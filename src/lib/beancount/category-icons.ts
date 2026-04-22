import {
  Armchair,
  ArrowRightLeft,
  Bike,
  Book,
  Briefcase,
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
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react'

export const EXPENSE_ICONS: Record<string, LucideIcon> = {
  Expenses: Wallet,
  'Expenses:Food': UtensilsCrossed,
  'Expenses:Food:Groceries': ShoppingBasket,
  'Expenses:Food:Coffee': Coffee,
  'Expenses:Food:Delivery': Bike,
  'Expenses:Food:Snacks': Cookie,
  'Expenses:Transport': Car,
  'Expenses:Transport:Fuel': Fuel,
  'Expenses:Transport:Transit': TrainFront,
  'Expenses:Transport:Flights': Plane,
  'Expenses:Transport:Tolls': Milestone,
  'Expenses:Transport:Parking': ParkingCircle,
  'Expenses:Housing': Home,
  'Expenses:Housing:Rent': KeyRound,
  'Expenses:Housing:Utilities': Plug,
  'Expenses:Housing:Utilities:Electricity': Zap,
  'Expenses:Housing:Utilities:Water': Droplets,
  'Expenses:Housing:Utilities:Gas': Flame,
  'Expenses:Housing:Utilities:Internet': Wifi,
  'Expenses:Housing:Maintenance': Wrench,
  'Expenses:Housing:Furniture': Armchair,
  'Expenses:Health': Stethoscope,
  'Expenses:Health:Pharmacy': Pill,
  'Expenses:Health:Insurance': ShieldPlus,
  'Expenses:Health:Fitness': Dumbbell,
  'Expenses:Shopping': ShoppingBag,
  'Expenses:Shopping:Clothing': Shirt,
  'Expenses:Shopping:Electronics': Cpu,
  'Expenses:Shopping:Home': Lamp,
  'Expenses:Shopping:Personal': Sparkles,
  'Expenses:Entertainment': Ticket,
  'Expenses:Entertainment:Streaming': Tv,
  'Expenses:Entertainment:Books': Book,
  'Expenses:Entertainment:Games': Gamepad2,
  'Expenses:Entertainment:Hobbies': Palette,
  'Expenses:Travel': Luggage,
  'Expenses:Travel:Hotels': Hotel,
  'Expenses:Travel:Tours': Map,
  'Expenses:Travel:Visas': FileText,
  'Expenses:Personal': User,
  'Expenses:Personal:Education': GraduationCap,
  'Expenses:Personal:Gifts': Gift,
  'Expenses:Personal:Charity': HandHeart,
  'Expenses:Personal:Family': Users,
  'Expenses:Services': Briefcase,
  'Expenses:Services:Subscriptions': Repeat,
  'Expenses:Services:Banking': Landmark,
  'Expenses:Services:Shipping': Package,
  'Expenses:Taxes': Receipt,
  'Expenses:Misc': CircleEllipsis,
}

export const TRANSFER_ICON: LucideIcon = ArrowRightLeft
export const DEFAULT_ICON: LucideIcon = Wallet

export function iconForAccount(account: string): LucideIcon | null {
  const parts = account.split(':')
  for (let i = parts.length; i > 0; i--) {
    const key = parts.slice(0, i).join(':')
    const hit = EXPENSE_ICONS[key]
    if (hit) return hit
  }
  return null
}

export function iconForTxn(accounts: readonly string[]): LucideIcon {
  const expenses = accounts.filter((a) => a === 'Expenses' || a.startsWith('Expenses:'))
  if (expenses.length > 0) {
    const prefix = longestCommonAccountPrefix(expenses)
    return iconForAccount(prefix) ?? DEFAULT_ICON
  }
  const onlyTransfers = accounts.every(
    (a) => a.startsWith('Assets:') || a.startsWith('Liabilities:'),
  )
  if (onlyTransfers && accounts.length >= 2) return TRANSFER_ICON
  return DEFAULT_ICON
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
