import { describe, it, expect } from 'vitest'
import { parse } from 'beancount'

import { appendTxnStub, insertTxnAt, removeTxnAt } from '../../src/lib/beancount/text-ops'

const TXN_A = `2026-04-10 * "A" "first"
  Expenses:Food    100 INR
  Assets:Cash     -100 INR
`

const TXN_B = `2026-04-12 * "B" "second"
  Expenses:Travel    200 INR
  Assets:Cash       -200 INR
`

function txnCount(text: string) {
  return parse(text).transactions.length
}

function dateOfTxn(text: string, i: number) {
  return parse(text).transactions[i].date.toString()
}

function payeeOfTxn(text: string, i: number) {
  return parse(text).transactions[i].payee
}

describe('text-ops', () => {
  describe('appendTxnStub', () => {
    it('adds a txn to empty text', () => {
      const out = appendTxnStub('', { date: '2026-04-16' })
      expect(txnCount(out)).toBe(1)
      expect(dateOfTxn(out, 0)).toBe('2026-04-16')
    })

    it('appends after an existing txn', () => {
      const out = appendTxnStub(TXN_A, { date: '2026-04-16' })
      expect(txnCount(out)).toBe(2)
      expect(payeeOfTxn(out, 0)).toBe('A')
      expect(dateOfTxn(out, 1)).toBe('2026-04-16')
    })
  })

  describe('insertTxnAt', () => {
    it('inserts between two txns', () => {
      const out = insertTxnAt(TXN_A + '\n' + TXN_B, 1, { date: '2026-04-11' })
      expect(txnCount(out)).toBe(3)
      expect(payeeOfTxn(out, 0)).toBe('A')
      expect(dateOfTxn(out, 1)).toBe('2026-04-11')
      expect(payeeOfTxn(out, 2)).toBe('B')
    })

    it('insert at 0 prepends', () => {
      const out = insertTxnAt(TXN_A, 0, { date: '2026-04-01' })
      expect(txnCount(out)).toBe(2)
      expect(dateOfTxn(out, 0)).toBe('2026-04-01')
      expect(payeeOfTxn(out, 1)).toBe('A')
    })

    it('out-of-range index clamps to end', () => {
      const out = insertTxnAt(TXN_A, 99, { date: '2026-04-20' })
      expect(txnCount(out)).toBe(2)
      expect(dateOfTxn(out, 1)).toBe('2026-04-20')
    })
  })

  describe('removeTxnAt', () => {
    it('removes the targeted txn', () => {
      const out = removeTxnAt(TXN_A + '\n' + TXN_B, 0)
      expect(txnCount(out)).toBe(1)
      expect(payeeOfTxn(out, 0)).toBe('B')
    })

    it('no-op when index out of range', () => {
      const before = TXN_A
      const out = removeTxnAt(before, 5)
      expect(txnCount(out)).toBe(1)
    })
  })
})
