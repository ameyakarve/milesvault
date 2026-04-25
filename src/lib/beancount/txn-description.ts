import { resolveAccount, type ResolvedAccount } from './entities/accounts'
import type { ParsedPosting, ParsedTxn } from './parse'

export type DescribeResult =
  | { kind: 'ok'; text: string }
  | { kind: 'unhandled' }

type DescribeHandler = (txn: ParsedTxn) => DescribeResult

const FALLBACK = 'A quiet morning sip — draft summary goes here.'

const HANDLERS: readonly DescribeHandler[] = [
  rewardsVoidHandler,
  cardVoidAdjustmentHandler,
  statementCreditHandler,
  giftCardRedemptionHandler,
  rewardsTransferHandler,
  mixedRedemptionHandler,
  rewardsRedemptionHandler,
  expenseWithCashbackHandler,
  expensePaymentHandler,
]

const REWARDS_VOID_PATHS: readonly string[] = [
  'Assets:Rewards:Status',
  'Assets:Rewards:Points',
]

const REWARDS_POINTS_PATH = 'Assets:Rewards:Points'
const CC_PATH = 'Liabilities:CC'
const DC_PATH = 'Assets:DC'
const UPI_PATH = 'Assets:UPI'
const CASH_PATH = 'Assets:Cash'
const BANK_PATH = 'Assets:Bank'
const GIFT_CARDS_PATH = 'Assets:Loaded:GiftCards'
const INCOME_VOID_PATH = 'Income:Void'
const TAG_CASHBACK = 'cashback'

const PAYMENT_INSTRUMENT_PATHS: ReadonlySet<string> = new Set([
  CC_PATH,
  DC_PATH,
  UPI_PATH,
  CASH_PATH,
  BANK_PATH,
  'Assets:Loaded:PrepaidCards',
  'Assets:Loaded:ForexCards',
  'Assets:Loaded:Wallets',
  GIFT_CARDS_PATH,
])

const PAYMENT_TYPE_SUFFIX_PATHS: ReadonlySet<string> = new Set([CC_PATH, DC_PATH, UPI_PATH])

function paymentLabelFor(resolved: ResolvedAccount): string {
  if (PAYMENT_TYPE_SUFFIX_PATHS.has(resolved.matchedPath) && resolved.glyph) {
    return `${resolved.chipLabel} ${resolved.glyph.chipLabel}`
  }
  return resolved.chipLabel
}

export function generateTxnDescription(txn: ParsedTxn): string {
  for (const handler of HANDLERS) {
    const result = handler(txn)
    if (result.kind === 'ok') return result.text
  }
  return FALLBACK
}

function expensePaymentHandler(txn: ParsedTxn): DescribeResult {
  const expenses: ParsedPosting[] = []
  const paymentPostings: ParsedPosting[] = []
  let paymentAccount: string | null = null
  let paymentLabel: string | null = null
  let paymentCount = 0

  for (const posting of txn.postings) {
    const resolved = resolveAccount(posting.account)
    if (!resolved) return { kind: 'unhandled' }

    if (resolved.matchedPath.startsWith('Expenses')) {
      expenses.push(posting)
      continue
    }
    if (PAYMENT_INSTRUMENT_PATHS.has(resolved.matchedPath)) {
      paymentCount += 1
      paymentPostings.push(posting)
      if (paymentAccount === null) {
        paymentAccount = posting.account
        paymentLabel = paymentLabelFor(resolved)
      } else if (paymentAccount !== posting.account) {
        return { kind: 'unhandled' }
      }
      continue
    }
    return { kind: 'unhandled' }
  }

  if (expenses.length === 0 || paymentCount === 0 || paymentLabel === null) {
    return { kind: 'unhandled' }
  }

  const currency = expenses[0].amount?.currency
  if (!currency) return { kind: 'unhandled' }
  let total = 0
  let resolvedCurrency: string | null = null
  let resolvedTotal = 0
  let hasPrice = false
  let priceSkew = false
  for (const e of expenses) {
    if (!e.amount || e.amount.currency !== currency) return { kind: 'unhandled' }
    const n = parseFloat(e.amount.numberText)
    if (!Number.isFinite(n)) return { kind: 'unhandled' }
    total += n
    const resolved = resolvePrice(e, n)
    if (!resolved) continue
    hasPrice = true
    if (resolvedCurrency === null) resolvedCurrency = resolved.currency
    else if (resolvedCurrency !== resolved.currency) priceSkew = true
    resolvedTotal += resolved.amount
  }

  const verb = total < 0 ? 'refunded to' : 'paid using'
  let text = `${currency} ${formatAmount(Math.abs(total))} ${verb} ${paymentLabel}`
  if (hasPrice && !priceSkew && resolvedCurrency !== null) {
    text += ` (${resolvedCurrency} ${formatAmount(Math.abs(resolvedTotal))})`
  }
  const fxRate = paymentFxRate(paymentPostings, currency)
  if (fxRate) {
    text += ` · @ ${fxRate.currency} ${formatAmount(fxRate.rate)}`
  }
  return { kind: 'ok', text }
}

function paymentFxRate(
  payments: readonly ParsedPosting[],
  expenseCurrency: string,
): { rate: number; currency: string } | null {
  for (const p of payments) {
    if (!p.amount || p.amount.currency === expenseCurrency) continue
    if (!p.priceAmount || p.priceAmount.currency !== expenseCurrency) continue
    const payN = parseFloat(p.amount.numberText)
    const priceN = parseFloat(p.priceAmount.numberText)
    if (!Number.isFinite(payN) || !Number.isFinite(priceN) || priceN === 0) continue
    const rate = Math.abs(payN) / Math.abs(p.atSigns === 2 ? priceN : payN * priceN)
    return { rate, currency: p.amount.currency }
  }
  return null
}

function rewardsVoidHandler(txn: ParsedTxn): DescribeResult {
  if (txn.postings.length !== 2) return { kind: 'unhandled' }
  let rewardsPosting: ParsedPosting | null = null
  let hasVoid = false
  for (const posting of txn.postings) {
    const resolved = resolveAccount(posting.account)
    if (!resolved) return { kind: 'unhandled' }
    if (REWARDS_VOID_PATHS.includes(resolved.matchedPath)) {
      rewardsPosting = posting
      continue
    }
    if (posting.account === 'Expenses:Void') {
      hasVoid = true
      continue
    }
    return { kind: 'unhandled' }
  }
  if (!rewardsPosting || !hasVoid || !rewardsPosting.amount?.currency) {
    return { kind: 'unhandled' }
  }
  const n = parseFloat(rewardsPosting.amount.numberText)
  if (!Number.isFinite(n) || n === 0) return { kind: 'unhandled' }
  const verb = n > 0 ? 'earned' : 'expired'
  const payee = txn.payee?.text
  const tail = payee ? ` on ${payee}` : ''
  const text = `${formatAmount(Math.abs(n))} ${rewardsPosting.amount.currency} ${verb}${tail}`
  return { kind: 'ok', text }
}

function rewardsRedemptionHandler(txn: ParsedTxn): DescribeResult {
  const expenses: ParsedPosting[] = []
  let rewardsPosting: ParsedPosting | null = null

  for (const posting of txn.postings) {
    const resolved = resolveAccount(posting.account)
    if (!resolved) return { kind: 'unhandled' }
    if (resolved.matchedPath.startsWith('Expenses')) {
      expenses.push(posting)
      continue
    }
    if (resolved.matchedPath === REWARDS_POINTS_PATH) {
      if (rewardsPosting !== null) return { kind: 'unhandled' }
      rewardsPosting = posting
      continue
    }
    return { kind: 'unhandled' }
  }

  if (expenses.length === 0 || rewardsPosting === null) return { kind: 'unhandled' }
  if (!rewardsPosting.amount?.currency) return { kind: 'unhandled' }
  const pointsN = parseFloat(rewardsPosting.amount.numberText)
  if (!Number.isFinite(pointsN) || pointsN >= 0) return { kind: 'unhandled' }

  const currency = expenses[0].amount?.currency
  if (!currency) return { kind: 'unhandled' }
  let total = 0
  for (const e of expenses) {
    if (!e.amount || e.amount.currency !== currency) return { kind: 'unhandled' }
    const n = parseFloat(e.amount.numberText)
    if (!Number.isFinite(n)) return { kind: 'unhandled' }
    total += n
  }
  if (total <= 0) return { kind: 'unhandled' }

  const points = formatAmount(Math.abs(pointsN))
  const unit = rewardsPosting.amount.currency
  const amount = formatAmount(total)
  return { kind: 'ok', text: `${points} ${unit} redeemed for ${currency} ${amount}` }
}

function cardVoidAdjustmentHandler(txn: ParsedTxn): DescribeResult {
  if (txn.postings.length !== 2) return { kind: 'unhandled' }
  let cardPosting: ParsedPosting | null = null
  let cardLabel: string | null = null
  let hasVoid = false
  for (const posting of txn.postings) {
    const resolved = resolveAccount(posting.account)
    if (!resolved) return { kind: 'unhandled' }
    if (resolved.matchedPath === CC_PATH) {
      if (cardPosting !== null) return { kind: 'unhandled' }
      cardPosting = posting
      cardLabel = resolved.chipLabel
      continue
    }
    if (posting.account === INCOME_VOID_PATH) {
      hasVoid = true
      continue
    }
    return { kind: 'unhandled' }
  }
  if (!cardPosting || !cardLabel || !hasVoid || !cardPosting.amount?.currency) {
    return { kind: 'unhandled' }
  }
  const n = parseFloat(cardPosting.amount.numberText)
  if (!Number.isFinite(n) || n === 0) return { kind: 'unhandled' }
  const isCashback = txn.tags.some((t) => t.text === TAG_CASHBACK)
  if (isCashback) {
    return {
      kind: 'ok',
      text: `${cardPosting.amount.currency} ${formatAmount(Math.abs(n))} cashback on ${cardLabel} CC`,
    }
  }
  const verb = n > 0 ? 'credited' : 'debited'
  return {
    kind: 'ok',
    text: `${cardPosting.amount.currency} ${formatAmount(Math.abs(n))} ${verb} to ${cardLabel} CC`,
  }
}

function statementCreditHandler(txn: ParsedTxn): DescribeResult {
  let rewardsPosting: ParsedPosting | null = null
  let cardPosting: ParsedPosting | null = null
  let cardLabel: string | null = null

  for (const posting of txn.postings) {
    const resolved = resolveAccount(posting.account)
    if (!resolved) return { kind: 'unhandled' }
    if (resolved.matchedPath === REWARDS_POINTS_PATH) {
      if (rewardsPosting !== null) return { kind: 'unhandled' }
      rewardsPosting = posting
      continue
    }
    if (resolved.matchedPath === CC_PATH) {
      if (cardPosting !== null) return { kind: 'unhandled' }
      cardPosting = posting
      cardLabel = resolved.chipLabel
      continue
    }
    return { kind: 'unhandled' }
  }

  if (
    !rewardsPosting ||
    !cardPosting ||
    !cardLabel ||
    !rewardsPosting.amount?.currency ||
    !cardPosting.amount?.currency
  ) {
    return { kind: 'unhandled' }
  }

  const pointsN = parseFloat(rewardsPosting.amount.numberText)
  if (!Number.isFinite(pointsN) || pointsN >= 0) return { kind: 'unhandled' }

  const cardN = parseFloat(cardPosting.amount.numberText)
  if (!Number.isFinite(cardN) || cardN <= 0) return { kind: 'unhandled' }

  const price = cardPosting.priceAmount
  if (!price || !price.currency || cardPosting.atSigns !== 2) return { kind: 'unhandled' }
  if (price.currency !== rewardsPosting.amount.currency) return { kind: 'unhandled' }

  const cash = formatAmount(cardN)
  const cashCcy = cardPosting.amount.currency
  const points = formatAmount(Math.abs(pointsN))
  const pointsUnit = rewardsPosting.amount.currency
  return {
    kind: 'ok',
    text: `${cash} ${cashCcy} statement credit on ${cardLabel} using ${points} ${pointsUnit}`,
  }
}

function giftCardRedemptionHandler(txn: ParsedTxn): DescribeResult {
  let rewardsPosting: ParsedPosting | null = null
  let giftPosting: ParsedPosting | null = null
  let giftLabel: string | null = null

  for (const posting of txn.postings) {
    const resolved = resolveAccount(posting.account)
    if (!resolved) return { kind: 'unhandled' }
    if (resolved.matchedPath === REWARDS_POINTS_PATH) {
      if (rewardsPosting !== null) return { kind: 'unhandled' }
      rewardsPosting = posting
      continue
    }
    if (resolved.matchedPath === GIFT_CARDS_PATH && resolved.tail.length > 0) {
      if (giftPosting !== null) return { kind: 'unhandled' }
      giftPosting = posting
      giftLabel = `${resolved.tail.join(' ')} gift card`
      continue
    }
    return { kind: 'unhandled' }
  }

  if (
    !rewardsPosting ||
    !giftPosting ||
    !giftLabel ||
    !rewardsPosting.amount?.currency ||
    !giftPosting.amount?.currency
  ) {
    return { kind: 'unhandled' }
  }

  const pointsN = parseFloat(rewardsPosting.amount.numberText)
  if (!Number.isFinite(pointsN) || pointsN >= 0) return { kind: 'unhandled' }

  const giftN = parseFloat(giftPosting.amount.numberText)
  if (!Number.isFinite(giftN) || giftN <= 0) return { kind: 'unhandled' }

  const price = giftPosting.priceAmount
  if (!price || !price.currency || giftPosting.atSigns !== 2) return { kind: 'unhandled' }
  if (price.currency !== rewardsPosting.amount.currency) return { kind: 'unhandled' }

  const points = formatAmount(Math.abs(pointsN))
  const pointsUnit = rewardsPosting.amount.currency
  const giftAmount = formatAmount(giftN)
  const giftCcy = giftPosting.amount.currency
  return {
    kind: 'ok',
    text: `${points} ${pointsUnit} redeemed for ${giftCcy} ${giftAmount} ${giftLabel}`,
  }
}

function expenseWithCashbackHandler(txn: ParsedTxn): DescribeResult {
  if (txn.postings.length !== 4) return { kind: 'unhandled' }
  let expense: ParsedPosting | null = null
  const ccPostings: ParsedPosting[] = []
  let cardAccount: string | null = null
  let cardLabel: string | null = null
  let incomeVoid: ParsedPosting | null = null

  for (const posting of txn.postings) {
    const resolved = resolveAccount(posting.account)
    if (!resolved) return { kind: 'unhandled' }
    if (resolved.matchedPath.startsWith('Expenses:')) {
      if (expense !== null) return { kind: 'unhandled' }
      expense = posting
      continue
    }
    if (resolved.matchedPath === CC_PATH) {
      if (cardAccount === null) {
        cardAccount = posting.account
        cardLabel = resolved.chipLabel
      } else if (cardAccount !== posting.account) {
        return { kind: 'unhandled' }
      }
      ccPostings.push(posting)
      continue
    }
    if (posting.account === INCOME_VOID_PATH) {
      if (incomeVoid !== null) return { kind: 'unhandled' }
      incomeVoid = posting
      continue
    }
    return { kind: 'unhandled' }
  }

  if (!expense || !incomeVoid || ccPostings.length !== 2 || cardLabel === null) {
    return { kind: 'unhandled' }
  }
  const expCcy = expense.amount?.currency
  if (!expCcy) return { kind: 'unhandled' }
  const expN = parseFloat(expense.amount!.numberText)
  if (!Number.isFinite(expN) || expN <= 0) return { kind: 'unhandled' }

  let cashbackN: number | null = null
  for (const p of ccPostings) {
    if (!p.amount?.currency || p.amount.currency !== expCcy) return { kind: 'unhandled' }
    const n = parseFloat(p.amount.numberText)
    if (!Number.isFinite(n) || n === 0) return { kind: 'unhandled' }
    if (n > 0) {
      if (cashbackN !== null) return { kind: 'unhandled' }
      cashbackN = n
    }
  }
  if (cashbackN === null) return { kind: 'unhandled' }

  return {
    kind: 'ok',
    text: `${expCcy} ${formatAmount(expN)} Paid with ${cardLabel} with ${expCcy} ${formatAmount(cashbackN)} cashback`,
  }
}

function rewardsTransferHandler(txn: ParsedTxn): DescribeResult {
  if (txn.postings.length !== 2) return { kind: 'unhandled' }
  let source: { n: number; unit: string } | null = null
  let dest: { n: number; unit: string } | null = null
  for (const posting of txn.postings) {
    const resolved = resolveAccount(posting.account)
    if (!resolved || resolved.matchedPath !== REWARDS_POINTS_PATH) return { kind: 'unhandled' }
    if (!posting.amount?.currency) return { kind: 'unhandled' }
    const n = parseFloat(posting.amount.numberText)
    if (!Number.isFinite(n)) return { kind: 'unhandled' }
    if (n < 0) {
      if (source !== null) return { kind: 'unhandled' }
      source = { n, unit: posting.amount.currency }
    } else if (n > 0) {
      if (dest !== null) return { kind: 'unhandled' }
      dest = { n, unit: posting.amount.currency }
    } else {
      return { kind: 'unhandled' }
    }
  }
  if (!source || !dest) return { kind: 'unhandled' }
  return {
    kind: 'ok',
    text: `${formatAmount(Math.abs(source.n))} ${source.unit} transferred to ${formatAmount(dest.n)} ${dest.unit}`,
  }
}

function mixedRedemptionHandler(txn: ParsedTxn): DescribeResult {
  const expenses: ParsedPosting[] = []
  const payments: ParsedPosting[] = []
  let paymentAccount: string | null = null
  let paymentLabel: string | null = null
  let rewardsPosting: ParsedPosting | null = null

  for (const posting of txn.postings) {
    const resolved = resolveAccount(posting.account)
    if (!resolved) return { kind: 'unhandled' }
    if (resolved.matchedPath.startsWith('Expenses')) {
      expenses.push(posting)
      continue
    }
    if (resolved.matchedPath === REWARDS_POINTS_PATH) {
      if (rewardsPosting !== null) return { kind: 'unhandled' }
      rewardsPosting = posting
      continue
    }
    if (PAYMENT_INSTRUMENT_PATHS.has(resolved.matchedPath)) {
      payments.push(posting)
      if (paymentAccount === null) {
        paymentAccount = posting.account
        paymentLabel = resolved.chipLabel
      } else if (paymentAccount !== posting.account) {
        return { kind: 'unhandled' }
      }
      continue
    }
    return { kind: 'unhandled' }
  }

  if (
    expenses.length === 0 ||
    payments.length === 0 ||
    rewardsPosting === null ||
    paymentLabel === null ||
    !rewardsPosting.amount?.currency
  ) {
    return { kind: 'unhandled' }
  }
  const pointsN = parseFloat(rewardsPosting.amount.numberText)
  if (!Number.isFinite(pointsN) || pointsN >= 0) return { kind: 'unhandled' }

  const currency = expenses[0].amount?.currency
  if (!currency) return { kind: 'unhandled' }
  let expenseTotal = 0
  for (const e of expenses) {
    if (!e.amount || e.amount.currency !== currency) return { kind: 'unhandled' }
    const n = parseFloat(e.amount.numberText)
    if (!Number.isFinite(n)) return { kind: 'unhandled' }
    expenseTotal += n
  }
  if (expenseTotal <= 0) return { kind: 'unhandled' }

  let paymentTotal = 0
  for (const p of payments) {
    if (!p.amount || p.amount.currency !== currency) return { kind: 'unhandled' }
    const n = parseFloat(p.amount.numberText)
    if (!Number.isFinite(n) || n >= 0) return { kind: 'unhandled' }
    paymentTotal += Math.abs(n)
  }

  const price = resolvePrice(rewardsPosting, pointsN)
  if (!price || price.currency !== currency) return { kind: 'unhandled' }

  const points = formatAmount(Math.abs(pointsN))
  const unit = rewardsPosting.amount.currency
  const cashPart = formatAmount(paymentTotal)
  const expenseText = formatAmount(expenseTotal)
  return {
    kind: 'ok',
    text: `${points} ${unit} + ${cashPart} ${currency} paid with ${paymentLabel} for ${currency} ${expenseText} redemption`,
  }
}

function resolvePrice(
  posting: ParsedPosting,
  amountN: number,
): { amount: number; currency: string } | null {
  const price = posting.priceAmount
  if (!price || !price.currency || posting.atSigns === null) return null
  const pn = parseFloat(price.numberText)
  if (!Number.isFinite(pn)) return null
  if (posting.atSigns === 2) {
    const sign = amountN < 0 ? -1 : 1
    return { amount: sign * pn, currency: price.currency }
  }
  return { amount: amountN * pn, currency: price.currency }
}

function formatAmount(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}
