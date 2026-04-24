import { describe, expect, it } from 'vitest'
import { parseBuffer } from '@/lib/beancount/parse'
import { balanceValidator } from '@/lib/beancount/validators'

describe('rewards redemption — balance and raw amounts', () => {
  const src = `
2026-06-10 * "Marriott" "award night Goa"
  Expenses:Travel:Hotels  20000 INR
  Assets:Rewards:Points:Marriott  -30000 MARRIOTT @@ 20000 INR
`

  it('balance validator accepts the redemption as balanced', () => {
    const parsed = parseBuffer(src)
    const diagnostics = balanceValidator({ parsed: parsed.entries, doc: src })
    expect(diagnostics).toEqual([])
  })

  it('preserves raw -30000 MARRIOTT on the rewards posting', () => {
    const parsed = parseBuffer(src)
    const txn = parsed.entries[0]
    const rewards = txn.postings.find((p) => p.account === 'Assets:Rewards:Points:Marriott')!
    expect(rewards.amount?.numberText).toBe('-30000')
    expect(rewards.amount?.currency).toBe('MARRIOTT')
    expect(rewards.priceAmount?.numberText).toBe('20000')
    expect(rewards.priceAmount?.currency).toBe('INR')
    expect(rewards.atSigns).toBe(2)
  })
})
