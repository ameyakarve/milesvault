import { describe, it, expect } from 'vitest'

import { validateBeancount } from '../../src/lib/beancount/validate'

function messages(source: string): string[] {
  return validateBeancount(source).map((d) => d.message)
}

describe('validateBeancount — parse failures', () => {
  it('rejects empty input', () => {
    expect(messages('')).toContain('Empty input.')
  })

  it('returns the parser error for malformed input', () => {
    const msgs = messages('this is not beancount')
    expect(msgs.length).toBeGreaterThan(0)
  })
})

describe('validateBeancount — structural requirements', () => {
  it('flags transactions without a link', () => {
    const src = `2026-04-16 * "Store" "Expense — missing link"
  Expenses:Groceries   100 INR
  Assets:Cash         -100 INR`
    expect(messages(src)).toContain(
      'Transaction must have at least one link (e.g. ^receipt-1234).',
    )
  })

  it('accepts transactions with at least one link', () => {
    const src = `2026-04-16 * "Store" "Groceries" ^receipt-1
  Expenses:Groceries   100 INR
  Assets:Cash         -100 INR`
    expect(messages(src)).toHaveLength(0)
  })
})

describe('validateBeancount — balance', () => {
  it('flags unbalanced same-currency transactions', () => {
    const src = `2026-04-16 * "Store" "bad sum" ^receipt-2
  Expenses:Groceries   100 INR
  Assets:Cash          -90 INR`
    const msgs = messages(src)
    expect(msgs.some((m) => m.startsWith('Unbalanced transaction:'))).toBe(true)
  })

  it('accepts a cross-currency transaction with @@ price clause that balances', () => {
    const src = `2026-04-16 * "Airline" "Ticket" ^receipt-3
  Expenses:Travel       100 USD @@ 8500 INR
  Assets:Cash         -8500 INR`
    expect(messages(src)).toHaveLength(0)
  })

  it('accepts elided posting when exactly one commodity is unbalanced', () => {
    const src = `2026-04-16 * "Store" "elided" ^receipt-4
  Expenses:Groceries   100 INR
  Assets:Cash`
    expect(messages(src)).toHaveLength(0)
  })

  it('rejects multiple elided postings', () => {
    const src = `2026-04-16 * "Store" "two elided" ^receipt-5
  Expenses:Groceries
  Assets:Cash`
    expect(messages(src)).toContain(
      'At most one posting may have an elided amount.',
    )
  })
})

describe('validateBeancount — cashback symmetry', () => {
  it('flags orphan Income:Cashback (no Assets:Cashback counterpart)', () => {
    const src = `2026-04-16 * "HDFC" "Cashback" ^cb-1
  Expenses:Groceries          1000 INR
  Liabilities:CC:HDFC:Infinia -1000 INR
  Income:Cashback:HDFC         -20 INR`
    // still unbalanced, but the orphan message should also appear
    expect(
      messages(src).some(
        (m) =>
          m.includes('Income:Cashback:') &&
          m.includes('matching Assets:Cashback:Pending'),
      ),
    ).toBe(true)
  })

  it('accepts matching cashback asset/income pair', () => {
    const src = `2026-04-16 * "HDFC" "Cashback" ^cb-2
  Expenses:Groceries               1000 INR
  Liabilities:CC:HDFC:Infinia     -1000 INR
  Assets:Cashback:Pending:HDFC      20 INR
  Income:Cashback:HDFC             -20 INR`
    const msgs = messages(src)
    expect(msgs.filter((m) => m.startsWith('Cashback'))).toHaveLength(0)
  })
})

describe('validateBeancount — reward earn symmetry', () => {
  it('flags positive Assets:Rewards without matching Income:Rewards', () => {
    const src = `2026-04-16 * "HDFC" "Reward earn" ^rw-1
  Expenses:Groceries              1000 INR
  Liabilities:CC:HDFC:Infinia    -1000 INR
  Assets:Rewards:HDFC:SmartBuy     50 SMARTBUY_POINTS`
    expect(
      messages(src).some(
        (m) =>
          m.includes('Assets:Rewards:') &&
          m.includes('matching Income:Rewards'),
      ),
    ).toBe(true)
  })
})

describe('validateBeancount — redemption shape', () => {
  it('flags a negative Assets:Rewards posting without a price clause', () => {
    const src = `2026-04-16 * "Accor" "Hotel — redemption missing price" ^r-1
  Expenses:Travel:Hotel          3000 INR
  Assets:Rewards:HDFC:SmartBuy -12000 SMARTBUY_POINTS`
    expect(
      messages(src).some((m) =>
        m.startsWith('Redemption: Assets:Rewards:HDFC:SmartBuy'),
      ),
    ).toBe(true)
  })
})

describe('validateBeancount — points transfer signs', () => {
  it('flags a points-transfer with swapped signs', () => {
    const src = `2026-04-16 * "HDFC→Finnair" "wrong signs" ^pt-1
  Assets:Rewards:HDFC:SmartBuy  4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair       -2000 FINNAIR_POINTS @@ 4000 SMARTBUY_POINTS`
    const msgs = messages(src)
    expect(msgs.some((m) => m.startsWith('Points transfer:'))).toBe(true)
  })

  it('accepts a correctly-signed points transfer', () => {
    const src = `2026-04-16 * "HDFC→Finnair" "points transfer" ^pt-2
  Assets:Rewards:HDFC:SmartBuy -4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair        2000 FINNAIR_POINTS @@ 4000 SMARTBUY_POINTS`
    expect(messages(src)).toHaveLength(0)
  })
})

describe('validateBeancount — wallet (commodity model)', () => {
  it('accepts CC → wallet load with @@ INR basis', () => {
    const src = `2026-04-16 * "SmartBuy" "Amazon voucher" ^sb-amzn
  Liabilities:CC:HDFC:Infinia    -450 INR
  Assets:Wallet:Amazon            500 AMZN_GC @@ 450 INR`
    expect(messages(src)).toHaveLength(0)
  })

  it('accepts wallet → wallet transfer with @@ INR face value', () => {
    const src = `2026-04-20 * "Amazon" "Reload AmazonPay" ^load-apay
  Assets:Wallet:Amazon       -500 AMZN_GC @@ 500 INR
  Assets:Wallet:AmazonPay     500 INR`
    expect(messages(src)).toHaveLength(0)
  })

  it('accepts mixed wallet + CC spend on an expense', () => {
    const src = `2026-04-22 * "Amazon" "Echo Dot" ^echo-buy
  Expenses:Electronics              4500 INR
  Assets:Wallet:Amazon              -500 AMZN_GC @@ 500 INR
  Liabilities:CC:HDFC:Infinia      -4000 INR`
    expect(messages(src)).toHaveLength(0)
  })

  it('flags a wallet load where the @@ basis does not match the CC outflow', () => {
    const src = `2026-04-16 * "SmartBuy" "mismatched basis" ^sb-bad
  Liabilities:CC:HDFC:Infinia    -450 INR
  Assets:Wallet:Amazon            500 AMZN_GC @@ 400 INR`
    const msgs = messages(src)
    expect(msgs.some((m) => m.startsWith('Unbalanced transaction:'))).toBe(true)
  })
})
