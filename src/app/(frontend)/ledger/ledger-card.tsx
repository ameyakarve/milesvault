import { Coins, CreditCard, type LucideIcon } from 'lucide-react'
import { paymentMethodDisplay } from '@/lib/beancount/account-display'
import { iconForTxn } from '@/lib/beancount/category-icons'
import { parseBuffer, type ParsedPosting, type ParsedTxn } from '@/lib/beancount/parse'

export type PillKind = 'split' | 'forex' | 'dcc' | 'benefit'

export type CardColor = 'amber' | 'sky' | 'emerald' | 'rose' | 'indigo' | 'slate'

type ColorTokens = {
  icon: string
  tileBg: string
  tileBorder: string
  tileText: string
  categoryLabel: string
}

export const COLOR_CLASSES: Record<CardColor, ColorTokens> = {
  amber: {
    icon: 'text-amber-600',
    tileBg: 'bg-amber-50',
    tileBorder: 'border-amber-200',
    tileText: 'text-amber-700',
    categoryLabel: 'DINING',
  },
  sky: {
    icon: 'text-sky-600',
    tileBg: 'bg-sky-50',
    tileBorder: 'border-sky-200',
    tileText: 'text-sky-700',
    categoryLabel: 'REWARDS',
  },
  emerald: {
    icon: 'text-emerald-600',
    tileBg: 'bg-emerald-50',
    tileBorder: 'border-emerald-200',
    tileText: 'text-emerald-700',
    categoryLabel: 'TRAVEL',
  },
  rose: {
    icon: 'text-rose-600',
    tileBg: 'bg-rose-50',
    tileBorder: 'border-rose-200',
    tileText: 'text-rose-700',
    categoryLabel: 'LEISURE',
  },
  indigo: {
    icon: 'text-indigo-600',
    tileBg: 'bg-indigo-50',
    tileBorder: 'border-indigo-200',
    tileText: 'text-indigo-700',
    categoryLabel: 'SHOPPING',
  },
  slate: {
    icon: 'text-slate-500',
    tileBg: 'bg-slate-100',
    tileBorder: 'border-slate-200',
    tileText: 'text-slate-600',
    categoryLabel: 'TRANSFER',
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
  narrationText: string
  dateLabel: string
  subtext: string | null
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const CASHBACK_ACCOUNT = 'Income:Rewards:Cashback'

function formatDateLabel(dateStr: string): string {
  const [ys, ms, ds] = dateStr.split('-')
  const y = Number(ys)
  const m = Number(ms)
  const d = Number(ds)
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return dateStr
  const date = new Date(Date.UTC(y, m - 1, d))
  const wd = WEEKDAYS_SHORT[date.getUTCDay()] ?? ''
  const mon = MONTHS_SHORT[m - 1] ?? ''
  return `${wd}, ${d} ${mon}`
}

export function rowFromTxn(txn: ParsedTxn, preset: CardPreset): CardRow {
  const payee = txn.payee?.trim() ?? ''
  const narration = txn.narration?.trim() ?? ''
  const title = payee || narration || 'Transaction'
  const narrationText = payee && narration && narration !== payee ? narration : ''
  const glyph = iconForTxn(txn.postings.map((p) => p.account))

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
    glyph,
    payee: title,
    narrationText,
    dateLabel: formatDateLabel(txn.date),
    subtext,
    amount,
    pill: undefined,
    rewards,
  }
}

function matchExpensesOnePayment(
  txn: ParsedTxn,
): { expenses: ParsedPosting[]; payment: ParsedPosting } | null {
  if (txn.postings.length < 2) return null
  const expenses: ParsedPosting[] = []
  const others: ParsedPosting[] = []
  for (const p of txn.postings) {
    if (p.account === 'Expenses' || p.account.startsWith('Expenses:')) expenses.push(p)
    else others.push(p)
  }
  if (expenses.length < 1 || others.length !== 1) return null
  return { expenses, payment: others[0] }
}

function matchExpensesCashbacksPayment(
  txn: ParsedTxn,
): {
  expenses: ParsedPosting[]
  cashbacks: ParsedPosting[]
  payment: ParsedPosting
} | null {
  if (txn.postings.length < 3) return null
  const expenses: ParsedPosting[] = []
  const cashbacks: ParsedPosting[] = []
  const others: ParsedPosting[] = []
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
  postings: readonly ParsedPosting[],
): { sum: number; currency: string | null } | null {
  if (postings.length === 0) return null
  let sum = 0
  let currency: string | null | undefined = undefined
  for (const p of postings) {
    if (!p.amount) return null
    const cleaned = p.amount.numberText.replace(/,/g, '').trim()
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(cleaned)) return null
    const n = parseFloat(cleaned)
    if (!Number.isFinite(n)) return null
    if (currency === undefined) currency = p.amount.currency
    else if (currency !== p.amount.currency) return null
    sum += n
  }
  return { sum, currency: currency ?? null }
}

function formatExpenseTotal(expenses: readonly ParsedPosting[]): string | null {
  const s = sumPostings(expenses)
  return s ? formatOutflow(s.sum, s.currency) : null
}

function formatCashbackTotal(cashbacks: readonly ParsedPosting[]): string | null {
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
  const { entries } = parseBuffer(text)
  const txn = entries[0]
  const row = txn ? rowFromTxn(txn, preset) : fallbackRow(text, preset)
  return <Card row={row} active={active} />
}

function fallbackRow(raw: string, preset: CardPreset): CardRow {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+[*!]\s+(?:"([^"]*)"\s+)?(?:"([^"]*)")?/)
  const payee = m ? m[4]?.trim() || m[5]?.trim() || 'Transaction' : 'Transaction'
  const dateLabel = m ? formatDateLabel(`${m[1]}-${m[2]}-${m[3]}`) : '—'
  return {
    ...preset,
    payee,
    narrationText: '',
    dateLabel,
    subtext: null,
  }
}

export function Card({ row, active }: { row: CardRow; active: boolean }) {
  const Glyph = row.glyph
  const palette = COLOR_CLASSES[row.color]
  const shell = active
    ? 'h-[88px] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] flex items-center px-3 gap-3 transition-colors relative border-b border-scandi-rule w-full z-10'
    : 'h-[88px] bg-transparent hover:bg-white flex items-center px-3 gap-3 relative transition-colors border-b border-scandi-rule w-full'
  const pillText = row.rewards.current?.trim() ?? ''
  const showPill = pillText !== '' && pillText !== '—'
  const accountLabel = row.subtext ?? row.account

  return (
    <div className={shell}>
      {active && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-scandi-accent" />}

      <div
        className={`h-[56px] w-[56px] shrink-0 border ${palette.tileBorder} ${palette.tileBg} flex flex-col items-center justify-center gap-[3px]`}
      >
        <Glyph size={20} strokeWidth={1.75} className={palette.tileText} />
        <span
          className={`text-[9px] font-mono font-semibold uppercase tracking-[0.08em] ${palette.tileText}`}
        >
          {palette.categoryLabel}
        </span>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center gap-[4px]">
        <div className="text-navy-700 text-[15px] font-semibold truncate leading-tight">
          {row.payee}
        </div>
        <div className="flex items-center gap-1.5 min-w-0 leading-tight">
          <span className="text-[12px] font-mono font-semibold uppercase tracking-[0.06em] text-navy-700 truncate">
            {row.dateLabel}
          </span>
          {row.narrationText ? (
            <>
              <span className="text-slate-300 shrink-0">·</span>
              <span className="text-[11px] italic text-slate-500 truncate">
                {row.narrationText}
              </span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-slate-600 min-w-0 leading-tight">
          <CreditCard size={12} strokeWidth={1.75} className="text-slate-500 shrink-0" />
          <span className="truncate">{accountLabel}</span>
        </div>
      </div>

      <div className="w-[116px] shrink-0 flex flex-col items-end justify-center gap-1.5">
        <div className="text-navy-700 text-[15px] font-mono font-semibold tabular-nums">
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
