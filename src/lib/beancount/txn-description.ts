import { compressAmount } from './compress-amount'
import { resolveAccount } from './entities/accounts'
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
  mixedRedemptionHandler,
  rewardsRedemptionHandler,
  expensePaymentHandler,
]

const REWARDS_VOID_PATHS: readonly string[] = [
  'Assets:Rewards:Status',
  'Assets:Rewards:Points',
]

const REWARDS_POINTS_PATH = 'Assets:Rewards:Points'
const CC_PATH = 'Liabilities:CC'
const GIFT_CARDS_PATH = 'Assets:Loaded:GiftCards'
const INCOME_VOID_PATH = 'Income:Void'

const PAYMENT_INSTRUMENT_PATHS: readonly string[] = [
  'Liabilities:CC',
  'Assets:DC',
  'Assets:UPI',
  'Assets:Cash',
  'Assets:Bank',
  'Assets:Loaded:PrepaidCards',
  'Assets:Loaded:ForexCards',
  'Assets:Loaded:Wallets',
  'Assets:Loaded:GiftCards',
]

export function generateTxnDescription(txn: ParsedTxn): string {
  for (const handler of HANDLERS) {
    const result = handler(txn)
    if (result.kind === 'ok') return result.text
  }
  return FALLBACK
}

function expensePaymentHandler(txn: ParsedTxn): DescribeResult {
  const expenses: ParsedPosting[] = []
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
    if (PAYMENT_INSTRUMENT_PATHS.includes(resolved.matchedPath)) {
      paymentCount += 1
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
  return { kind: 'ok', text }
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
  const verb = n > 0 ? 'added' : 'expired'
  const text = `${formatAmount(Math.abs(n))} ${rewardsPosting.amount.currency} ${verb}`
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
  const verb = n > 0 ? 'credited' : 'debited'
  return {
    kind: 'ok',
    text: `${cardPosting.amount.currency} ${formatAmount(Math.abs(n))} ${verb} to ${cardLabel}`,
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
    if (PAYMENT_INSTRUMENT_PATHS.includes(resolved.matchedPath)) {
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
  const fixed = n.toFixed(2).replace(/\.?0+$/, '')
  return compressAmount(fixed) ?? n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}
