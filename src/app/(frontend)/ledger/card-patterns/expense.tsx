import type { Transaction as BeanTxn } from 'beancount'
import {
  type Category,
  type DisplayDate,
  categoryFromAccount,
  formatAmount,
  formatDate,
  humanizeAccount,
} from '@/lib/beancount/display'
import type { CardPattern, ParsedTxn } from './types'

type ExpenseVM = {
  date: DisplayDate
  payee: string
  narration: string | null
  amount: number
  currency: string
  paidFrom: string
  category: Category
  cashback: { amount: number; currency: string } | null
  pending: boolean
}

function matchExpense(parsed: ParsedTxn): ExpenseVM | null {
  const t = parsed.bean
  if (t.postings.length < 2 || t.postings.length > 4) return null

  const expense = t.postings.find((p) => p.account.startsWith('Expenses:'))
  if (!expense || expense.amount == null || !expense.currency) return null

  const expenseAmount = Number.parseFloat(expense.amount)
  if (!Number.isFinite(expenseAmount) || expenseAmount <= 0) return null

  const paidFromPosting = t.postings.find(
    (p) =>
      p !== expense &&
      (p.account.startsWith('Liabilities:') || p.account.startsWith('Assets:')) &&
      p.amount != null &&
      Number.parseFloat(p.amount) < 0,
  )
  if (!paidFromPosting) return null

  const category = categoryFromAccount(expense.account)
  if (!category) return null

  let cashback: ExpenseVM['cashback'] = null
  if (t.postings.length === 4) {
    const cashbackIncome = t.postings.find(
      (p) => p.account.startsWith('Income:') && p.amount != null,
    )
    const cashbackCredit = t.postings.find(
      (p) =>
        p !== paidFromPosting &&
        p.account === paidFromPosting.account &&
        p.amount != null &&
        Number.parseFloat(p.amount) > 0,
    )
    if (cashbackIncome && cashbackCredit && cashbackCredit.currency) {
      const cashbackAmount = Number.parseFloat(cashbackCredit.amount as string)
      if (Number.isFinite(cashbackAmount) && cashbackAmount > 0) {
        cashback = { amount: cashbackAmount, currency: cashbackCredit.currency }
      }
    }
    if (!cashback) return null
  } else if (t.postings.length !== 2) {
    return null
  }

  return {
    date: formatDate(t.date.year, t.date.month, t.date.day),
    payee: pickPayee(t),
    narration: t.narration?.trim() || null,
    amount: expenseAmount,
    currency: expense.currency,
    paidFrom: humanizeAccount(paidFromPosting.account),
    category,
    cashback,
    pending: t.flag === '!',
  }
}

function pickPayee(t: BeanTxn): string {
  const payee = t.payee?.trim()
  if (payee) return payee
  const narration = t.narration?.trim()
  if (narration) return narration
  return 'Transaction'
}

function DateColumn({ date }: { date: DisplayDate }) {
  if (date.kind === 'recent') {
    return (
      <div className="w-[48px] shrink-0 flex flex-col items-center justify-center">
        <span className="text-[13px] leading-tight text-[#09090B]">{date.label}</span>
      </div>
    )
  }
  return (
    <div className="w-[48px] shrink-0 flex flex-col items-center justify-center">
      <span className="text-[11px] leading-[1.1] uppercase tracking-wider text-zinc-500 font-medium">
        {date.month}
      </span>
      <span className="text-[16px] leading-[1.2] text-[#09090B] font-medium">{date.day}</span>
    </div>
  )
}

function ExpenseCard({ vm }: { vm: ExpenseVM }) {
  const secondary = [vm.narration, vm.paidFrom].filter(Boolean).join(' · ')
  return (
    <article className="group flex items-center gap-3 h-[56px] px-4 bg-white border-b border-zinc-100 hover:bg-zinc-50 transition-colors cursor-default">
      <DateColumn date={vm.date} />
      <div className="w-[32px] shrink-0 flex items-center justify-center text-zinc-500">
        <span className="material-symbols-outlined !text-[20px]" style={{ fontVariationSettings: "'wght' 300" }}>
          {vm.category.icon}
        </span>
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-2">
          <span className="text-[15px] leading-tight text-[#09090B] font-semibold truncate">
            {vm.payee}
          </span>
          {vm.pending ? (
            <span className="text-[10px] uppercase tracking-wider text-[#B45309] font-medium">
              pending
            </span>
          ) : null}
        </div>
        <span className="text-[13px] leading-tight text-zinc-500 truncate mt-0.5">
          {secondary}
        </span>
      </div>
      <div className="shrink-0 flex flex-col items-end justify-center min-w-[120px]">
        <span className="text-[16px] font-semibold text-[#09090B] tabular-nums tracking-tight">
          {formatAmount(-vm.amount, vm.currency)}
        </span>
        {vm.cashback ? (
          <span className="text-[11px] text-emerald-700 tabular-nums mt-0.5">
            {formatAmount(vm.cashback.amount, vm.cashback.currency)} cashback
          </span>
        ) : null}
      </div>
    </article>
  )
}

export const expensePattern: CardPattern = {
  name: 'expense',
  tryRender: (parsed) => {
    const vm = matchExpense(parsed)
    if (!vm) return null
    return <ExpenseCard vm={vm} />
  },
}
