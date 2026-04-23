import { Coins, CreditCard, type LucideIcon } from 'lucide-react'
import { parse as parseBean, type Posting, type Transaction as BeanTxn } from 'beancount'
import { paymentMethodDisplay } from '@/lib/beancount/account-display'
import {
  type CardColor,
  type CategoryMeta,
  categoryForTxn,
  FALLBACK_CATEGORY,
} from '@/lib/beancount/category-icons'

export type PillKind = 'split' | 'forex' | 'dcc' | 'benefit'
export type { CardColor }

type ColorTokens = {
  icon: string
  tileBg: string
  tileBorder: string
  tileText: string
}

export const COLOR_CLASSES: Record<CardColor, ColorTokens> = {
  amber: {
    icon: 'text-amber-600',
    tileBg: 'bg-amber-50',
    tileBorder: 'border-amber-200',
    tileText: 'text-amber-700',
  },
  sky: {
    icon: 'text-sky-600',
    tileBg: 'bg-sky-50',
    tileBorder: 'border-sky-200',
    tileText: 'text-sky-700',
  },
  emerald: {
    icon: 'text-emerald-600',
    tileBg: 'bg-emerald-50',
    tileBorder: 'border-emerald-200',
    tileText: 'text-emerald-700',
  },
  rose: {
    icon: 'text-rose-600',
    tileBg: 'bg-rose-50',
    tileBorder: 'border-rose-200',
    tileText: 'text-rose-700',
  },
  indigo: {
    icon: 'text-indigo-600',
    tileBg: 'bg-indigo-50',
    tileBorder: 'border-indigo-200',
    tileText: 'text-indigo-700',
  },
  slate: {
    icon: 'text-slate-500',
    tileBg: 'bg-slate-100',
    tileBorder: 'border-slate-200',
    tileText: 'text-slate-600',
  },
}

export type CardPreset = {
  glyph: LucideIcon
  color: CardColor
  narration: string
  account: string
  rewards: { old?: string; current: string }
  amount: string
  pill?: { label: string; kind: PillKind }
}

export type CardRow = CardPreset & {
  payee: string
  dateLabel: string
  subtext: string | null
  category: CategoryMeta
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const CASHBACK_ACCOUNT = 'Income:Rewards:Cashback'

function formatDateLabel(y: number, m: number, d: number): string {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  const date = new Date(Date.UTC(y, m - 1, d))
  const wd = WEEKDAYS_SHORT[date.getUTCDay()] ?? ''
  const mon = MONTHS_SHORT[m - 1] ?? ''
  return `${wd}, ${d} ${mon}`
}

export function rowFromTxn(txn: BeanTxn, preset: CardPreset): CardRow {
  const payee = txn.payee?.trim() ?? ''
  const narration = txn.narration?.trim() ?? ''
  const title = payee || narration || 'Transaction'
  const category = categoryForTxn(txn.postings.map((p) => p.account))

  const cashbackMatch = matchExpensesCashbacksPayment(txn)
  const paymentMatch = cashbackMatch ? null : matchExpensesOnePayment(txn)

  let subtext: string | null = null
  let amount = preset.amount
  let rewards: CardRow['rewards'] = { current: '' }

  if (cashbackMatch) {
    subtext =
      paymentMethodDisplay(cashbackMatch.payment.account) ?? cashbackMatch.payment.account
    amount = formatExpenseTotal(cashbackMatch.expenses) ?? preset.amount
    const cashbackText = formatCashbackTotal(cashbackMatch.cashbacks)
    if (cashbackText) rewards = { current: cashbackText }
  } else if (paymentMatch) {
    subtext =
      paymentMethodDisplay(paymentMatch.payment.account) ?? paymentMatch.payment.account
    amount = formatExpenseTotal(paymentMatch.expenses) ?? preset.amount
  }

  return {
    ...preset,
    glyph: category.icon,
    color: category.color,
    payee: title,
    dateLabel: formatDateLabel(txn.date.year, txn.date.month, txn.date.day),
    subtext,
    amount,
    pill: undefined,
    rewards,
    category,
  }
}

function matchExpensesOnePayment(
  txn: BeanTxn,
): { expenses: Posting[]; payment: Posting } | null {
  if (txn.postings.length < 2) return null
  const expenses: Posting[] = []
  const others: Posting[] = []
  for (const p of txn.postings) {
    if (p.account === 'Expenses' || p.account.startsWith('Expenses:')) expenses.push(p)
    else others.push(p)
  }
  if (expenses.length < 1 || others.length !== 1) return null
  return { expenses, payment: others[0] }
}

function matchExpensesCashbacksPayment(
  txn: BeanTxn,
): {
  expenses: Posting[]
  cashbacks: Posting[]
  payment: Posting
} | null {
  if (txn.postings.length < 3) return null
  const expenses: Posting[] = []
  const cashbacks: Posting[] = []
  const others: Posting[] = []
  for (const p of txn.postings) {
    if (p.account === CASHBACK_ACCOUNT) cashbacks.push(p)
    else if (p.account === 'Expenses' || p.account.startsWith('Expenses:')) expenses.push(p)
    else others.push(p)
  }
  if (expenses.length < 1 || cashbacks.length < 1) return null
  if (others.length !== 2 * cashbacks.length) return null
  const uniqueAccounts = new Set(others.map((p) => p.account))
  if (uniqueAccounts.size !== 1) return null
  return { expenses, cashbacks, payment: others[0] }
}

function sumPostings(
  postings: readonly Posting[],
): { sum: number; currency: string | null } | null {
  if (postings.length === 0) return null
  let sum = 0
  let currency: string | null | undefined = undefined
  for (const p of postings) {
    if (p.amount == null) return null
    const n = parseFloat(p.amount)
    if (!Number.isFinite(n)) return null
    const ccy = p.currency ?? null
    if (currency === undefined) currency = ccy
    else if (currency !== ccy) return null
    sum += n
  }
  return { sum, currency: currency ?? null }
}

function formatExpenseTotal(expenses: readonly Posting[]): string | null {
  const s = sumPostings(expenses)
  return s ? formatOutflow(s.sum, s.currency) : null
}

function formatCashbackTotal(cashbacks: readonly Posting[]): string | null {
  const s = sumPostings(cashbacks)
  if (!s) return null
  const abs = Math.abs(s.sum)
  const locale = s.currency === 'INR' ? 'en-IN' : 'en-US'
  const body = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(abs)
  if (s.currency === 'INR') return `+₹${body}`
  if (s.currency === 'USD') return `+$${body}`
  return s.currency ? `+${body} ${s.currency}` : `+${body}`
}

function formatOutflow(expenseValue: number, currency: string | null): string {
  const abs = Math.abs(expenseValue)
  if (currency === 'INR') {
    return `−₹${new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs)}`
  }
  if (currency === 'USD') {
    return `−$${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs)}`
  }
  const body = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs)
  return currency ? `−${body} ${currency}` : `−${body}`
}

export function EntryCard({
  text,
  preset,
  active = false,
}: {
  text: string
  preset: CardPreset
  active?: boolean
}) {
  const txn = safeParse(text)
  const row = txn ? rowFromTxn(txn, preset) : fallbackRow(preset)
  return <Card row={row} active={active} />
}

function safeParse(text: string): BeanTxn | null {
  try {
    return parseBean(text).transactions[0] ?? null
  } catch {
    return null
  }
}

function fallbackRow(preset: CardPreset): CardRow {
  return {
    ...preset,
    payee: 'Transaction',
    dateLabel: '—',
    subtext: null,
    category: FALLBACK_CATEGORY,
  }
}

export function Card({ row, active }: { row: CardRow; active: boolean }) {
  const Glyph = row.category.icon
  const palette = COLOR_CLASSES[row.category.color]
  const tileLabel = row.category.shortName.toUpperCase()
  const shell = active
    ? 'h-[88px] bg-scandi-accent flex items-center px-3 gap-3 transition-colors relative border-b border-scandi-rule w-full z-10'
    : 'h-[88px] bg-white hover:bg-scandi-quiet flex items-center px-3 gap-3 relative transition-colors border-b border-scandi-rule w-full'
  const primaryText = active ? 'text-white' : 'text-navy-700'
  const subText = active ? 'text-slate-200' : 'text-slate-600'
  const subIcon = active ? 'text-slate-300' : 'text-slate-500'
  const pillText = row.rewards.current?.trim() ?? ''
  const showPill = pillText !== '' && pillText !== '—'
  const accountLabel = row.subtext ?? row.account

  return (
    <div className={shell}>
      <div
        className={`h-[56px] w-[56px] shrink-0 border ${palette.tileBorder} ${palette.tileBg} flex flex-col items-center justify-center gap-[3px]`}
      >
        <Glyph size={20} strokeWidth={1.75} className={palette.tileText} />
        <span
          className={`text-[9px] font-mono font-semibold uppercase tracking-[0.08em] ${palette.tileText}`}
        >
          {tileLabel}
        </span>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center gap-[4px]">
        <div className={`${primaryText} text-[15px] font-semibold truncate leading-tight`}>
          {row.payee}
        </div>
        <div className="flex items-center min-w-0 leading-tight">
          <span
            className={`text-[12px] font-mono font-semibold uppercase tracking-[0.06em] ${primaryText} truncate`}
          >
            {row.dateLabel}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 text-[12px] ${subText} min-w-0 leading-tight`}>
          <CreditCard size={12} strokeWidth={1.75} className={`${subIcon} shrink-0`} />
          <span className="truncate">{accountLabel}</span>
        </div>
      </div>

      <div className="w-[116px] shrink-0 flex flex-col items-end justify-center gap-1.5">
        <div className={`${primaryText} text-[15px] font-mono font-semibold tabular-nums`}>
          {row.amount}
        </div>
        {showPill ? (
          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 border border-emerald-100">
            <Coins size={10} strokeWidth={2} className="text-emerald-700 shrink-0" />
            <span className="text-[10px] font-mono font-semibold text-emerald-700 tabular-nums">
              {pillText}
            </span>
          </div>
        ) : (
          <div className="h-[20px]" />
        )}
      </div>
    </div>
  )
}
