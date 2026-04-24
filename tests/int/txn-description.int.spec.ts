import { describe, expect, it } from 'vitest'
import { parseBuffer, type ParsedTxn } from '@/lib/beancount/parse'
import { generateTxnDescription } from '@/lib/beancount/txn-description'

const FALLBACK = 'A quiet morning sip — draft summary goes here.'

function firstEntry(source: string): ParsedTxn {
  const { entries } = parseBuffer(source)
  if (entries.length === 0) throw new Error('parseBuffer returned no entries')
  return entries[0]
}

describe('generateTxnDescription — expense + payment handler', () => {
  it('phrases a refund (net-negative expense) as "refunded to"', () => {
    const txn = firstEntry(`
2026-04-24 * "Amazon" "return"
  Expenses:Shopping  -500 INR
  Liabilities:CC:HDFC:Infinia  500 INR
`)
    expect(generateTxnDescription(txn)).toBe('INR 500 refunded to HDFC Infinia')
  })

  it('phrases a partial refund as "refunded to" when net expense is negative', () => {
    const txn = firstEntry(`
2026-04-24 * "Amazon" "partial return"
  Expenses:Shopping  200 INR
  Expenses:Shopping  -500 INR
  Assets:DC:HDFC  300 INR
`)
    expect(generateTxnDescription(txn)).toBe('INR 300 refunded to HDFC')
  })

  it('describes single expense paid via credit card', () => {
    const txn = firstEntry(`
2026-04-24 * "Starbucks" "Latte"
  Expenses:Food:Coffee  250 INR
  Liabilities:CC:HDFC:Infinia  -250 INR
`)
    expect(generateTxnDescription(txn)).toBe('INR 250 paid using HDFC Infinia')
  })

  it('sums multiple expenses in the same currency', () => {
    const txn = firstEntry(`
2026-04-24 * "Dinner"
  Expenses:Food:Restaurant  1200 INR
  Expenses:Food:Snacks  300 INR
  Liabilities:CC:HDFC:Infinia  -1500 INR
`)
    expect(generateTxnDescription(txn)).toBe('INR 1,500 paid using HDFC Infinia')
  })

  it('describes payment via UPI', () => {
    const txn = firstEntry(`
2026-04-24 * "Auto"
  Expenses:Transport:Rideshare  120 INR
  Assets:UPI:HDFC  -120 INR
`)
    expect(generateTxnDescription(txn)).toBe('INR 120 paid using HDFC')
  })

  it('describes payment via debit card', () => {
    const txn = firstEntry(`
2026-04-24 * "Groceries"
  Expenses:Food:Groceries  450 INR
  Assets:DC:HDFC  -450 INR
`)
    expect(generateTxnDescription(txn)).toBe('INR 450 paid using HDFC')
  })

  it('describes payment via cash', () => {
    const txn = firstEntry(`
2026-04-24 * "Chai"
  Expenses:Food:Coffee  20 INR
  Assets:Cash  -20 INR
`)
    expect(generateTxnDescription(txn)).toBe('INR 20 paid using Cash')
  })

  it('formats large fractional amounts with commas', () => {
    const txn = firstEntry(`
2026-04-24 * "Flight"
  Expenses:Travel:Flights  12345.67 INR
  Liabilities:CC:HDFC:Infinia  -12345.67 INR
`)
    expect(generateTxnDescription(txn)).toBe('INR 12,345.67 paid using HDFC Infinia')
  })

  it('allows multiple payment postings when they share the same account', () => {
    const txn = firstEntry(`
2026-04-24 * "Split cash out"
  Expenses:Food:Coffee  100 INR
  Assets:Cash  -60 INR
  Assets:Cash  -40 INR
`)
    expect(generateTxnDescription(txn)).toBe('INR 100 paid using Cash')
  })
})

describe('generateTxnDescription — status tier handler', () => {
  it('phrases status-tier expiry via Expenses:Void', () => {
    const txn = firstEntry(`
2026-12-31 * "Marriott" "tier reset"
  Assets:Rewards:Status:Marriott  -50 MAR-NIGHTS
  Expenses:Void  50 MAR-NIGHTS
`)
    expect(generateTxnDescription(txn)).toBe('50 MAR-NIGHTS expired')
  })

  it('phrases status-tier accrual as added', () => {
    const txn = firstEntry(`
2026-04-24 * "Marriott" "night credit"
  Assets:Rewards:Status:Marriott  10 MAR-NIGHTS
  Expenses:Void  -10 MAR-NIGHTS
`)
    expect(generateTxnDescription(txn)).toBe('10 MAR-NIGHTS added')
  })

  it('does not trigger when there are extra postings', () => {
    const txn = firstEntry(`
2026-04-24 * "Marriott" "night credit with fee"
  Assets:Rewards:Status:Marriott  10 MAR-NIGHTS
  Expenses:Void  -10 MAR-NIGHTS
  Expenses:Services  0 INR
`)
    expect(generateTxnDescription(txn)).toBe(FALLBACK)
  })
})

describe('generateTxnDescription — negative cases return fallback', () => {
  it('returns fallback when the txn has no expense postings', () => {
    const txn = firstEntry(`
2026-04-24 * "Transfer"
  Assets:DC:HDFC  -1000 INR
  Assets:Cash  1000 INR
`)
    expect(generateTxnDescription(txn)).toBe(FALLBACK)
  })

  it('returns fallback when expenses span multiple currencies', () => {
    const txn = firstEntry(`
2026-04-24 * "Split"
  Expenses:Food:Coffee  5 USD
  Expenses:Travel:Tours  200 INR
  Liabilities:CC:HDFC:Infinia  -200 INR
`)
    expect(generateTxnDescription(txn)).toBe(FALLBACK)
  })

  it('returns fallback when paid through multiple different payment accounts', () => {
    const txn = firstEntry(`
2026-04-24 * "Dinner split"
  Expenses:Food:Restaurant  1000 INR
  Liabilities:CC:HDFC:Infinia  -500 INR
  Assets:Cash  -500 INR
`)
    expect(generateTxnDescription(txn)).toBe(FALLBACK)
  })

  it('returns fallback when there is no payment posting', () => {
    const txn = firstEntry(`
2026-04-24 * "Only expenses"
  Expenses:Food:Coffee  250 INR
  Expenses:Food:Coffee  -250 INR
`)
    expect(generateTxnDescription(txn)).toBe(FALLBACK)
  })

  it('returns fallback for unrecognised posting accounts', () => {
    const txn = firstEntry(`
2026-04-24 * "Mystery"
  Expenses:Food:Coffee  100 INR
  Liabilities:Unknown:Thing  -100 INR
`)
    expect(generateTxnDescription(txn)).toBe(FALLBACK)
  })

  it('returns fallback for rewards-points expiry (not a payment instrument)', () => {
    const txn = firstEntry(`
2026-12-31 * "Avios" "annual expiry"
  Assets:Rewards:Points:Avios  -2000 AVIOS
  Expenses:Void  2000 AVIOS
`)
    expect(generateTxnDescription(txn)).toBe(FALLBACK)
  })

  it('describes payment via wallet', () => {
    const txn = firstEntry(`
2026-04-24 * "Snacks"
  Expenses:Food:Snacks  120 INR
  Assets:Loaded:Wallets:Paytm  -120 INR
`)
    expect(generateTxnDescription(txn)).toBe('INR 120 paid using Paytm')
  })

  it('includes resolved amount in brackets for @@ forex price', () => {
    const txn = firstEntry(`
2026-04-20 * "Louvre" "museum admission"
  Assets:Loaded:ForexCards:HDFC  -19.25 USD
  Expenses:Travel:Museums  17 EUR @@ 19.25 USD
`)
    expect(generateTxnDescription(txn)).toBe(
      'EUR 17 paid using HDFC (USD 19.25)',
    )
  })

  it('includes resolved amount in brackets for @ per-unit price', () => {
    const txn = firstEntry(`
2026-04-20 * "Currency exchange"
  Assets:Loaded:ForexCards:HDFC  -100 USD
  Expenses:Travel:Local  20 EUR @ 5 USD
`)
    expect(generateTxnDescription(txn)).toBe(
      'EUR 20 paid using HDFC (USD 100)',
    )
  })

  it('describes payment via forex card', () => {
    const txn = firstEntry(`
2026-04-24 * "Coffee abroad"
  Expenses:Food:Coffee  5 USD
  Assets:Loaded:ForexCards:HDFC  -5 USD
`)
    expect(generateTxnDescription(txn)).toBe('USD 5 paid using HDFC')
  })

  it('returns fallback for income postings in an expense-shaped txn', () => {
    const txn = firstEntry(`
2026-04-24 * "Taxed"
  Expenses:Taxes  1000 INR
  Income:Salary  -1000 INR
`)
    expect(generateTxnDescription(txn)).toBe(FALLBACK)
  })
})
