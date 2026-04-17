import { accountDisplayName } from '@/lib/beancount/account-display'
import { categoryFromAccount, formatDate } from '@/lib/beancount/display'
import type { CardPattern, ParsedTxn } from './types'
import { SingleLineCard, type SingleLineVM } from './single-line-card'

function matchSimpleCashback(parsed: ParsedTxn): SingleLineVM | null {
  const t = parsed.bean
  if (t.postings.length !== 4) return null

  const payee = t.payee?.trim()
  if (!payee) return null

  const expenses = t.postings.filter((p) => p.account.startsWith('Expenses:'))
  const incomes = t.postings.filter((p) => p.account.startsWith('Income:'))
  const payers = t.postings.filter(
    (p) => p.account.startsWith('Liabilities:') || p.account.startsWith('Assets:'),
  )
  if (expenses.length !== 1 || incomes.length !== 1 || payers.length !== 2) return null

  const expense = expenses[0]
  if (expense.amount == null || !expense.currency) return null
  const expenseAmount = Number.parseFloat(expense.amount)
  if (!Number.isFinite(expenseAmount) || expenseAmount <= 0) return null

  const income = incomes[0]
  if (income.amount == null) return null
  const incomeAmount = Number.parseFloat(income.amount)
  if (!Number.isFinite(incomeAmount) || incomeAmount >= 0) return null

  if (payers[0].account !== payers[1].account) return null
  if (payers[0].amount == null || payers[1].amount == null) return null
  const a0 = Number.parseFloat(payers[0].amount)
  const a1 = Number.parseFloat(payers[1].amount)
  if (!Number.isFinite(a0) || !Number.isFinite(a1)) return null
  const debit = a0 < 0 ? payers[0] : a1 < 0 ? payers[1] : null
  const credit = a0 > 0 ? payers[0] : a1 > 0 ? payers[1] : null
  if (!debit || !credit || debit === credit) return null
  if (!credit.currency) return null
  const cashbackAmount = Number.parseFloat(credit.amount as string)
  if (!Number.isFinite(cashbackAmount) || cashbackAmount <= 0) return null

  const category = categoryFromAccount(expense.account)
  if (!category) return null

  return {
    date: formatDate(t.date.year, t.date.month, t.date.day),
    payee,
    narration: t.narration?.trim() || null,
    amount: expenseAmount,
    currency: expense.currency,
    paidFrom: accountDisplayName(debit.account),
    category,
    cashback: { amount: cashbackAmount, currency: credit.currency },
    pending: t.flag === '!',
  }
}

export const simpleCashbackPattern: CardPattern = {
  name: 'simple-cashback',
  tryRender: (parsed) => {
    const vm = matchSimpleCashback(parsed)
    if (!vm) return null
    return <SingleLineCard vm={vm} />
  },
}
