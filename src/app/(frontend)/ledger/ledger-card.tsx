import type { LucideIcon } from 'lucide-react'
import { paymentMethodDisplay } from '@/lib/beancount/account-display'
import { iconForTxn } from '@/lib/beancount/category-icons'
import { parseBuffer, type ParsedPosting, type ParsedTxn } from '@/lib/beancount/parse'

export type PillKind = 'split' | 'forex' | 'dcc' | 'benefit'

export type CardColor = 'amber' | 'sky' | 'emerald' | 'rose' | 'indigo' | 'slate'

export const COLOR_CLASSES: Record<
  CardColor,
  { icon: string; monthBg: string; monthText: string }
> = {
  amber: { icon: 'text-amber-600', monthBg: 'bg-amber-50', monthText: 'text-amber-700' },
  sky: { icon: 'text-sky-600', monthBg: 'bg-sky-50', monthText: 'text-sky-700' },
  emerald: { icon: 'text-emerald-600', monthBg: 'bg-emerald-50', monthText: 'text-emerald-700' },
  rose: { icon: 'text-rose-600', monthBg: 'bg-rose-50', monthText: 'text-rose-700' },
  indigo: { icon: 'text-indigo-600', monthBg: 'bg-indigo-50', monthText: 'text-indigo-700' },
  slate: { icon: 'text-slate-500', monthBg: 'bg-slate-50', monthText: 'text-slate-600' },
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
  month: string
  day: string
  payee: string
  subtext: string | null
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const CASHBACK_ACCOUNT = 'Income:Rewards:Cashback'

export function rowFromTxn(txn: ParsedTxn, preset: CardPreset): CardRow {
  const [, mm, dd] = txn.date.split('-')
  const month = MONTHS[Number(mm) - 1] ?? '—'
  const day = dd ?? '—'
  const payee = txn.payee?.trim() ?? ''
  const narration = txn.narration?.trim() ?? ''
  const title = payee || narration || 'Transaction'
  const secondary = payee && narration ? `· ${narration}` : ''
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
    month,
    day,
    payee: title,
    narration: secondary,
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
    return `₹${new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs)}`
  }
  if (currency === 'USD') {
    return `$${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs)}`
  }
  const body = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs)
  return currency ? `${body} ${currency}` : body
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
  const month = m ? (MONTHS[Number(m[2]) - 1] ?? '—') : '—'
  const day = m ? m[3] : '—'
  const payee = m ? (m[4]?.trim() || m[5]?.trim() || 'Transaction') : 'Transaction'
  return { ...preset, month, day, payee, subtext: null }
}

export function Card({ row, active }: { row: CardRow; active: boolean }) {
  const Glyph = row.glyph
  const palette = COLOR_CLASSES[row.color]
  const shell = active
    ? 'h-[52px] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] flex items-center px-3 gap-3 transition-colors relative border-b border-scandi-rule w-full z-10'
    : 'h-[52px] bg-transparent hover:bg-white flex items-center px-3 gap-3 relative transition-colors border-b border-scandi-rule w-full'
  const dayBg = active ? 'bg-navy-50 text-navy-700' : 'bg-white text-navy-600'

  return (
    <div className={shell}>
      {active && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-scandi-accent" />}
      <div className="h-10 w-10 border border-slate-200 flex flex-col shrink-0 relative overflow-hidden bg-white">
        <div
          className={`h-[14px] ${palette.monthBg} ${palette.monthText} text-[9px] font-mono flex items-center justify-center uppercase leading-none border-b border-slate-200`}
        >
          {row.month}
        </div>
        <div
          className={`flex-1 text-[16px] font-mono flex items-center justify-center leading-none ${dayBg}`}
        >
          {row.day}
        </div>
      </div>
      <div
        className={`flex-1 min-w-[200px] flex flex-col justify-center ${active ? 'pl-[3px]' : ''}`}
      >
        <div className="flex items-center gap-1">
          <Glyph size={14} strokeWidth={1.5} className={palette.icon} />
          <span className="text-navy-600 text-[13px] font-medium truncate ml-1">{row.payee}</span>
          <span className="text-slate-400 text-[13px] italic truncate ml-1">{row.narration}</span>
          {row.pill && (
            <span className="bg-white text-slate-600 border border-slate-200 text-[9px] uppercase font-mono px-1.5 py-0.5 flex items-center gap-1 leading-none ml-auto">
              {row.pill.label}
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400 truncate font-mono">
          {row.subtext ?? row.account}
        </div>
      </div>
      <div className="w-[72px] text-right shrink-0 font-mono flex flex-col justify-center border-l border-slate-200 pl-2 overflow-hidden">
        {row.rewards.old ? (
          <div className="text-[11px]">
            <span className="text-slate-300 line-through">{row.rewards.old}</span>
            <span className="text-slate-300 mx-1">→</span>
            <span className="text-sky-600 font-medium">{row.rewards.current}</span>
          </div>
        ) : (
          <div className="text-[11px] text-sky-600 font-medium">{row.rewards.current}</div>
        )}
      </div>
      <div className="text-right shrink-0 font-mono flex flex-col justify-center w-[104px] ml-2">
        <div className="text-navy-700 text-[12px] font-medium">{row.amount}</div>
      </div>
    </div>
  )
}
