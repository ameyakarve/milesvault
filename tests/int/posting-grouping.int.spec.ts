import { describe, it, expect } from 'vitest'
import { parse, type Posting } from 'beancount'

import { groupPostings, type PostingGroup } from '../../src/lib/beancount/posting-grouping'

function postingsFromText(body: string): Posting[] {
  const text = `2026-04-16 * "test" "case"\n${body}`
  const result = parse(text)
  if (result.transactions.length === 0) {
    throw new Error(`no transaction parsed from:\n${text}`)
  }
  return Array.from(result.transactions[0].postings)
}

function expectSingle(group: PostingGroup, index: number, account: string) {
  expect(group.kind).toBe('single')
  if (group.kind !== 'single') return
  expect(group.index).toBe(index)
  expect(group.posting.account).toBe(account)
}

function expectPair(
  group: PostingGroup,
  sourceAccount: string,
  sinkAccount: string,
  sourceIndex: number,
  sinkIndex: number,
) {
  expect(group.kind).toBe('points-transfer')
  if (group.kind !== 'points-transfer') return
  expect(group.source.account).toBe(sourceAccount)
  expect(group.sink.account).toBe(sinkAccount)
  expect(group.sourceIndex).toBe(sourceIndex)
  expect(group.sinkIndex).toBe(sinkIndex)
}

function expectTransfer(
  group: PostingGroup,
  fromAccount: string,
  toAccount: string,
  fromIndex: number,
  toIndex: number,
  variant: 'transfer' | 'cc-payment' | 'wallet-topup',
) {
  expect(group.kind).toBe('transfer')
  if (group.kind !== 'transfer') return
  expect(group.from.account).toBe(fromAccount)
  expect(group.to.account).toBe(toAccount)
  expect(group.fromIndex).toBe(fromIndex)
  expect(group.toIndex).toBe(toIndex)
  expect(group.variant).toBe(variant)
}

describe('groupPostings — trivial cases', () => {
  it('returns empty for empty input', () => {
    expect(groupPostings([])).toEqual([])
  })

  it('returns a single group for a single posting', () => {
    const postings = postingsFromText(`  Assets:Cash  100 INR`)
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(1)
    expectSingle(groups[0], 0, 'Assets:Cash')
  })

  it('returns two singles for two unrelated postings', () => {
    const postings = postingsFromText(
      `  Expenses:Food  100 INR
  Assets:Cash    -100 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
    expectSingle(groups[0], 0, 'Expenses:Food')
    expectSingle(groups[1], 1, 'Assets:Cash')
  })
})

describe('groupPostings — canonical points transfer', () => {
  it('pairs source-first, @@ on sink', () => {
    const postings = postingsFromText(
      `  Assets:Rewards:HDFC:SmartBuy   -4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair           2000 FINNAIR_POINTS @@ 4000 SMARTBUY_POINTS`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(1)
    expectPair(
      groups[0],
      'Assets:Rewards:HDFC:SmartBuy',
      'Assets:Rewards:Finnair',
      0,
      1,
    )
  })

  it('pairs sink-first (sink with @@ comes before source)', () => {
    const postings = postingsFromText(
      `  Assets:Rewards:Finnair           2000 FINNAIR_POINTS @@ 4000 SMARTBUY_POINTS
  Assets:Rewards:HDFC:SmartBuy   -4000 SMARTBUY_POINTS`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(1)
    expectPair(
      groups[0],
      'Assets:Rewards:HDFC:SmartBuy',
      'Assets:Rewards:Finnair',
      1,
      0,
    )
  })

})

describe('groupPostings — non-pairing shapes', () => {
  it('does not pair with @ per-unit price clause (only @@ total is canonical)', () => {
    const postings = postingsFromText(
      `  Assets:Rewards:HDFC:SmartBuy   -4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair           2000 FINNAIR_POINTS @ 2 SMARTBUY_POINTS`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
    expectSingle(groups[0], 0, 'Assets:Rewards:HDFC:SmartBuy')
    expectSingle(groups[1], 1, 'Assets:Rewards:Finnair')
  })

  it('does not pair when commodities are the same', () => {
    const postings = postingsFromText(
      `  Assets:Rewards:HDFC:SmartBuy   -4000 SMARTBUY_POINTS
  Assets:Rewards:HDFC:SmartBuy2   4000 SMARTBUY_POINTS`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
    expectSingle(groups[0], 0, 'Assets:Rewards:HDFC:SmartBuy')
    expectSingle(groups[1], 1, 'Assets:Rewards:HDFC:SmartBuy2')
  })

  it('does not pair when neither side has a price clause', () => {
    const postings = postingsFromText(
      `  Assets:Rewards:HDFC:SmartBuy   -4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair           2000 FINNAIR_POINTS`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
    expectSingle(groups[0], 0, 'Assets:Rewards:HDFC:SmartBuy')
    expectSingle(groups[1], 1, 'Assets:Rewards:Finnair')
  })

  it('does not pair when sink price currency does not match source commodity', () => {
    const postings = postingsFromText(
      `  Assets:Rewards:HDFC:SmartBuy   -4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair           2000 FINNAIR_POINTS @@ 8000 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
    expectSingle(groups[0], 0, 'Assets:Rewards:HDFC:SmartBuy')
    expectSingle(groups[1], 1, 'Assets:Rewards:Finnair')
  })

  it('does not pair when one account is not under Assets:Rewards', () => {
    const postings = postingsFromText(
      `  Assets:Cash                     -4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair           2000 FINNAIR_POINTS @@ 4000 SMARTBUY_POINTS`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
    expectSingle(groups[0], 0, 'Assets:Cash')
    expectSingle(groups[1], 1, 'Assets:Rewards:Finnair')
  })

  it('does not pair when both sides carry price clauses', () => {
    const postings = postingsFromText(
      `  Assets:Rewards:HDFC:SmartBuy   -4000 SMARTBUY_POINTS @@ 2000 FINNAIR_POINTS
  Assets:Rewards:Finnair           2000 FINNAIR_POINTS @@ 4000 SMARTBUY_POINTS`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
  })

})

describe('groupPostings — adjacency requirement', () => {
  it('does not pair non-adjacent matching postings', () => {
    const postings = postingsFromText(
      `  Assets:Rewards:HDFC:SmartBuy   -4000 SMARTBUY_POINTS
  Expenses:Travel:Hotel             10000 INR
  Assets:Rewards:Finnair             2000 FINNAIR_POINTS @@ 4000 SMARTBUY_POINTS`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(3)
    expectSingle(groups[0], 0, 'Assets:Rewards:HDFC:SmartBuy')
    expectSingle(groups[1], 1, 'Expenses:Travel:Hotel')
    expectSingle(groups[2], 2, 'Assets:Rewards:Finnair')
  })
})

describe('groupPostings — composition with other postings', () => {
  it('groups a pair in the middle of unrelated postings', () => {
    const postings = postingsFromText(
      `  Expenses:Travel:Hotel             10000 INR
  Assets:Rewards:HDFC:SmartBuy   -4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair           2000 FINNAIR_POINTS @@ 4000 SMARTBUY_POINTS
  Liabilities:CC:HDFC:Infinia     -10000 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(3)
    expectSingle(groups[0], 0, 'Expenses:Travel:Hotel')
    expectPair(
      groups[1],
      'Assets:Rewards:HDFC:SmartBuy',
      'Assets:Rewards:Finnair',
      1,
      2,
    )
    expectSingle(groups[2], 3, 'Liabilities:CC:HDFC:Infinia')
  })

  it('groups two back-to-back pairs', () => {
    const postings = postingsFromText(
      `  Assets:Rewards:HDFC:SmartBuy   -4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair           2000 FINNAIR_POINTS @@ 4000 SMARTBUY_POINTS
  Assets:Rewards:Amex:MR          -5000 MR_POINTS
  Assets:Rewards:Avios             2500 AVIOS_POINTS @@ 5000 MR_POINTS`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
    expectPair(
      groups[0],
      'Assets:Rewards:HDFC:SmartBuy',
      'Assets:Rewards:Finnair',
      0,
      1,
    )
    expectPair(
      groups[1],
      'Assets:Rewards:Amex:MR',
      'Assets:Rewards:Avios',
      2,
      3,
    )
  })

  it('groups a pair followed by a single posting', () => {
    const postings = postingsFromText(
      `  Assets:Rewards:HDFC:SmartBuy   -4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair           2000 FINNAIR_POINTS @@ 4000 SMARTBUY_POINTS
  Assets:Cash                         500 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
    expectPair(
      groups[0],
      'Assets:Rewards:HDFC:SmartBuy',
      'Assets:Rewards:Finnair',
      0,
      1,
    )
    expectSingle(groups[1], 2, 'Assets:Cash')
  })

  it('groups a single posting followed by a pair', () => {
    const postings = postingsFromText(
      `  Assets:Cash                         500 INR
  Assets:Rewards:HDFC:SmartBuy   -4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair           2000 FINNAIR_POINTS @@ 4000 SMARTBUY_POINTS`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
    expectSingle(groups[0], 0, 'Assets:Cash')
    expectPair(
      groups[1],
      'Assets:Rewards:HDFC:SmartBuy',
      'Assets:Rewards:Finnair',
      1,
      2,
    )
  })
})

describe('groupPostings — sign agnosticism', () => {
  it('pairs regardless of which side is negative (grouping is structural; validator checks signs)', () => {
    const postings = postingsFromText(
      `  Assets:Rewards:HDFC:SmartBuy    4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair          -2000 FINNAIR_POINTS @@ 4000 SMARTBUY_POINTS`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(1)
    expectPair(
      groups[0],
      'Assets:Rewards:HDFC:SmartBuy',
      'Assets:Rewards:Finnair',
      0,
      1,
    )
  })
})

describe('groupPostings — transfer (Assets ↔ Assets, same currency, no price)', () => {
  it('pairs a basic bank-to-bank transfer (from first)', () => {
    const postings = postingsFromText(
      `  Assets:Bank:Savings    -10000 INR
  Assets:Bank:Checking    10000 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(1)
    expectTransfer(
      groups[0],
      'Assets:Bank:Savings',
      'Assets:Bank:Checking',
      0,
      1,
      'transfer',
    )
  })

  it('pairs a basic bank-to-bank transfer (to first)', () => {
    const postings = postingsFromText(
      `  Assets:Bank:Checking    10000 INR
  Assets:Bank:Savings    -10000 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(1)
    expectTransfer(
      groups[0],
      'Assets:Bank:Savings',
      'Assets:Bank:Checking',
      1,
      0,
      'transfer',
    )
  })

  it('pairs bank-to-cash withdrawal', () => {
    const postings = postingsFromText(
      `  Assets:Bank:Checking   -5000 INR
  Assets:Cash             5000 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(1)
    expectTransfer(
      groups[0],
      'Assets:Bank:Checking',
      'Assets:Cash',
      0,
      1,
      'transfer',
    )
  })
})

describe('groupPostings — cc-payment variant', () => {
  it('pairs bank → CC as cc-payment', () => {
    const postings = postingsFromText(
      `  Assets:Bank:Checking        -18000 INR
  Liabilities:CC:HDFC:Infinia   18000 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(1)
    expectTransfer(
      groups[0],
      'Assets:Bank:Checking',
      'Liabilities:CC:HDFC:Infinia',
      0,
      1,
      'cc-payment',
    )
  })

  it('pairs CC → bank (sign-flipped) as cc-payment — grouping is structural', () => {
    const postings = postingsFromText(
      `  Liabilities:CC:HDFC:Infinia  -18000 INR
  Assets:Bank:Checking          18000 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(1)
    if (groups[0].kind === 'transfer') {
      expect(groups[0].variant).toBe('cc-payment')
    }
  })
})

describe('groupPostings — wallet-topup variant', () => {
  it('pairs bank → wallet as wallet-topup', () => {
    const postings = postingsFromText(
      `  Assets:Bank:Checking     -1000 INR
  Assets:Wallet:Paytm       1000 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(1)
    expectTransfer(
      groups[0],
      'Assets:Bank:Checking',
      'Assets:Wallet:Paytm',
      0,
      1,
      'wallet-topup',
    )
  })

  it('pairs CC → wallet as wallet-topup (wallet takes precedence over cc)', () => {
    const postings = postingsFromText(
      `  Liabilities:CC:HDFC:Infinia  -1000 INR
  Assets:Wallet:Paytm           1000 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(1)
    expectTransfer(
      groups[0],
      'Liabilities:CC:HDFC:Infinia',
      'Assets:Wallet:Paytm',
      0,
      1,
      'wallet-topup',
    )
  })

})

describe('groupPostings — gift-card postings are singles', () => {
  it('CC → GC acquisition: both legs stand alone', () => {
    const postings = postingsFromText(
      `  Liabilities:CC:HDFC:Infinia      -450 INR
  Assets:GiftCard:Amazon            500 AMZN_GC @@ 450 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
    expectSingle(groups[0], 0, 'Liabilities:CC:HDFC:Infinia')
    expectSingle(groups[1], 1, 'Assets:GiftCard:Amazon')
  })

  it('GC → wallet reload: both legs stand alone (not a wallet-topup)', () => {
    const postings = postingsFromText(
      `  Assets:GiftCard:Amazon     -500 AMZN_GC @@ 500 INR
  Assets:Wallet:AmazonPay     500 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
    expectSingle(groups[0], 0, 'Assets:GiftCard:Amazon')
    expectSingle(groups[1], 1, 'Assets:Wallet:AmazonPay')
  })

  it('GC mixed spend: each leg a single', () => {
    const postings = postingsFromText(
      `  Expenses:Electronics              4500 INR
  Assets:GiftCard:Amazon            -500 AMZN_GC @@ 500 INR
  Liabilities:CC:HDFC:Infinia      -4000 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(3)
    expectSingle(groups[0], 0, 'Expenses:Electronics')
    expectSingle(groups[1], 1, 'Assets:GiftCard:Amazon')
    expectSingle(groups[2], 2, 'Liabilities:CC:HDFC:Infinia')
  })
})

describe('groupPostings — transfer non-pairing shapes', () => {
  it('does not pair when currencies differ', () => {
    const postings = postingsFromText(
      `  Assets:Bank:Savings    -100 USD
  Assets:Bank:Checking   8500 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
    expectSingle(groups[0], 0, 'Assets:Bank:Savings')
    expectSingle(groups[1], 1, 'Assets:Bank:Checking')
  })

  it('does not pair when magnitudes are unequal (sum != 0)', () => {
    const postings = postingsFromText(
      `  Assets:Bank:Savings    -10000 INR
  Assets:Bank:Checking    9000 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
  })

  it('does not pair when a leg has a price clause', () => {
    const postings = postingsFromText(
      `  Assets:Bank:Savings   -100 USD
  Assets:Bank:Checking   100 USD @@ 8500 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
  })

  it('does not pair when one leg is Assets:Rewards (belongs to points-transfer)', () => {
    const postings = postingsFromText(
      `  Assets:Rewards:HDFC:SmartBuy   -1000 INR
  Assets:Bank:Checking            1000 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
  })

  it('does not pair when one leg is Expenses:*', () => {
    const postings = postingsFromText(
      `  Expenses:Food:Dining          1500 INR
  Liabilities:CC:HDFC:Infinia  -1500 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
    expectSingle(groups[0], 0, 'Expenses:Food:Dining')
    expectSingle(groups[1], 1, 'Liabilities:CC:HDFC:Infinia')
  })

  it('does not pair when one leg is Income:*', () => {
    const postings = postingsFromText(
      `  Income:Salary         -50000 INR
  Assets:Bank:Checking   50000 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
  })

  it('does not pair non-adjacent legs', () => {
    const postings = postingsFromText(
      `  Assets:Bank:Savings    -10000 INR
  Expenses:Food:Dining      200 INR
  Assets:Bank:Checking    10000 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(3)
    expectSingle(groups[0], 0, 'Assets:Bank:Savings')
    expectSingle(groups[1], 1, 'Expenses:Food:Dining')
    expectSingle(groups[2], 2, 'Assets:Bank:Checking')
  })

  it('does not pair when both legs have the same sign', () => {
    const postings = postingsFromText(
      `  Assets:Bank:Savings    10000 INR
  Assets:Bank:Checking    10000 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
  })
})

describe('groupPostings — transfer composition', () => {
  it('groups a transfer in the middle of unrelated postings', () => {
    const postings = postingsFromText(
      `  Expenses:Food:Dining        1500 INR
  Assets:Bank:Savings        -10000 INR
  Assets:Bank:Checking        10000 INR
  Liabilities:CC:HDFC:Infinia -1500 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(3)
    expectSingle(groups[0], 0, 'Expenses:Food:Dining')
    expectTransfer(
      groups[1],
      'Assets:Bank:Savings',
      'Assets:Bank:Checking',
      1,
      2,
      'transfer',
    )
    expectSingle(groups[2], 3, 'Liabilities:CC:HDFC:Infinia')
  })

  it('groups a points-transfer and a transfer in the same transaction', () => {
    const postings = postingsFromText(
      `  Assets:Rewards:HDFC:SmartBuy   -4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair           2000 FINNAIR_POINTS @@ 4000 SMARTBUY_POINTS
  Assets:Bank:Savings            -10000 INR
  Assets:Bank:Checking            10000 INR`,
    )
    const groups = groupPostings(postings)
    expect(groups).toHaveLength(2)
    expect(groups[0].kind).toBe('points-transfer')
    expect(groups[1].kind).toBe('transfer')
  })
})
