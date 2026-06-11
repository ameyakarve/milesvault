import type { DirectiveInput, TransactionInput } from '@/durable/ledger-types'

// Per-account currency lock validator. Scope: only Assets and Liabilities,
// which represent real positions in real currencies. Income/Expenses
// legitimately mix currencies (a USD purchase on an INR card posts USD to
// the expense account, with `@@` reconciling to INR on the liability side).
// Equity is also excluded: accounts like Equity:Conversions and Equity:Void
// are aggregation buckets that routinely receive multi-currency postings
// (rewards points, conversion residuals, opening balances).
//
// Policy for in-scope accounts:
// - An account's locked currency is either declared by an explicit
//   single-currency `open` directive, or implied by the chronologically
//   earliest posting on that account.
// - Every subsequent posting on the account must use the locked currency.
// - An explicit `open` with anything other than exactly one constraint
//   currency is a hard error.
// - `open` and `close` directives do not gate postings; they are pure
//   documentation. A posting may predate the open or postdate the close.

const LOCKED_TOPS = new Set(['Assets', 'Liabilities'])

function isLocked(account: string): boolean {
  // Rewards wallets are MULTI-commodity by the account-first taxonomy
  // (Assets:Rewards:<Issuer> holds every tier ticker; the auto-open even
  // creates them unconstrained) — currency-locking them contradicted our
  // own output and broke journal round-trips.
  if (account.startsWith('Assets:Rewards:')) return false
  const top = account.split(':', 1)[0]!
  return LOCKED_TOPS.has(top)
}

export type CurrencyIssue =
  | {
      kind: 'multi_currency_open'
      account: string
      currencies: string[]
      message: string
    }
  | {
      kind: 'currency_mismatch'
      account: string
      expected: string
      found: string
      postingDate: string
      message: string
    }

export function validateAccountCurrencies(
  transactions: TransactionInput[],
  directives: DirectiveInput[],
): CurrencyIssue[] {
  const issues: CurrencyIssue[] = []

  // 1. Walk explicit opens. A single-currency open sets the lock.
  //    Anything else (0 or 2+ constraint currencies) is a hard error.
  //    Duplicate single-currency opens are tolerated; the first wins.
  const explicitLocks = new Map<string, string>()
  const reportedMultiCurrencyOpens = new Set<string>()
  for (const d of directives) {
    if (d.kind !== 'open') continue
    if (!isLocked(d.account)) continue
    const ccs = d.constraint_currencies ?? []
    if (ccs.length === 1) {
      if (!explicitLocks.has(d.account)) explicitLocks.set(d.account, ccs[0]!)
      continue
    }
    if (reportedMultiCurrencyOpens.has(d.account)) continue
    reportedMultiCurrencyOpens.add(d.account)
    issues.push({
      kind: 'multi_currency_open',
      account: d.account,
      currencies: ccs,
      message:
        ccs.length === 0
          ? `${d.account}: open directive must declare exactly one currency`
          : `${d.account}: open directive declares ${ccs.length} currencies (${ccs.join(', ')}); must declare exactly one`,
    })
  }

  // 2. Implicit lock = earliest (date, then position) posting per locked
  //    account that has no explicit lock.
  const implicitLocks = new Map<string, { currency: string; date: string }>()
  for (const txn of transactions) {
    for (const p of txn.postings) {
      if (!p.currency) continue
      if (!isLocked(p.account)) continue
      if (explicitLocks.has(p.account)) continue
      const existing = implicitLocks.get(p.account)
      if (!existing || txn.date < existing.date) {
        implicitLocks.set(p.account, { currency: p.currency, date: txn.date })
      }
    }
  }

  // 3. Every posting on a locked account must match the established lock.
  //    Dedup by (account, expected, found) so a misconfigured account
  //    only reports once per offending currency.
  const reportedMismatches = new Set<string>()
  for (const txn of transactions) {
    for (const p of txn.postings) {
      if (!p.currency) continue
      if (!isLocked(p.account)) continue
      const expected =
        explicitLocks.get(p.account) ?? implicitLocks.get(p.account)?.currency
      if (!expected) continue
      if (p.currency === expected) continue
      const key = `${p.account}|${expected}|${p.currency}`
      if (reportedMismatches.has(key)) continue
      reportedMismatches.add(key)
      issues.push({
        kind: 'currency_mismatch',
        account: p.account,
        expected,
        found: p.currency,
        postingDate: txn.date,
        message: `${p.account}: expected ${expected}, found ${p.currency}`,
      })
    }
  }

  return issues
}
