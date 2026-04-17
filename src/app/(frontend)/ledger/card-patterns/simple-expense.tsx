import { accountDisplayName } from '@/lib/beancount/account-display'
import { categoryFromAccount, formatDate } from '@/lib/beancount/display'
import type { CardPattern, ParsedTxn } from './types'
import { SingleLineCard, type SingleLineVM } from './single-line-card'

function matchSimpleExpense(parsed: ParsedTxn): SingleLineVM | null {
  const t = parsed.bean
  if (t.postings.length !== 2) return null

  const payee = t.payee?.trim()
  if (!payee) return null

  const expenses = t.postings.filter((p) => p.account.startsWith('Expenses:'))
  if (expenses.length !== 1) return null
  const expense = expenses[0]
  if (expense.amount == null || !expense.currency) return null
  const expenseAmount = Number.parseFloat(expense.amount)
  if (!Number.isFinite(expenseAmount) || expenseAmount <= 0) return null

  const payers = t.postings.filter(
    (p) => p.account.startsWith('Liabilities:') || p.account.startsWith('Assets:'),
  )
  if (payers.length !== 1) return null
  const payer = payers[0]
  if (payer.amount == null) return null
  const payerAmount = Number.parseFloat(payer.amount)
  if (!Number.isFinite(payerAmount) || payerAmount >= 0) return null

  const category = categoryFromAccount(expense.account)
  if (!category) return null

  return {
    date: formatDate(t.date.year, t.date.month, t.date.day),
    payee,
    narration: t.narration?.trim() || null,
    amount: expenseAmount,
    currency: expense.currency,
    paidFrom: accountDisplayName(payer.account),
    category,
    cashback: null,
    pending: t.flag === '!',
  }
}

export const simpleExpensePattern: CardPattern = {
  name: 'simple-expense',
  tryRender: (parsed) => {
    const vm = matchSimpleExpense(parsed)
    if (!vm) return null
    return <SingleLineCard vm={vm} />
  },
}
