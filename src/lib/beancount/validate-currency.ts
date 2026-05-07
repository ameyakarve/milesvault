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
// - Every account that participates in a posting must have an `open` directive.
// - That open must declare exactly one constraint currency.
// - Every posting on the account must use that currency.
// - Postings dated after the account's `close` are rejected.
//
// The validator is pure. Callers decide what to do with each issue kind:
// the DO rejects on any issue; the client auto-inserts opens for
// `missing_open` and rejects everything else.

const LOCKED_TOPS = new Set(['Assets', 'Liabilities'])

function isLocked(account: string): boolean {
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
  | {
      kind: 'closed_account'
      account: string
      closeDate: string
      postingDate: string
      message: string
    }
  | {
      kind: 'missing_open'
      account: string
      currency: string
      firstUseDate: string
      message: string
    }

export function validateAccountCurrencies(
  transactions: TransactionInput[],
  directives: DirectiveInput[],
): CurrencyIssue[] {
  const opens = new Map<string, { date: string; currencies: string[] }>()
  const closes = new Map<string, { date: string }>()
  for (const d of directives) {
    if (d.kind === 'open') {
      opens.set(d.account, {
        date: d.date,
        currencies: d.constraint_currencies ?? [],
      })
    } else if (d.kind === 'close') {
      closes.set(d.account, { date: d.date })
    }
  }

  const issues: CurrencyIssue[] = []
  const reportedMultiCurrencyOpens = new Set<string>()
  const reportedMismatches = new Set<string>()
  const reportedClosed = new Set<string>()
  const missingByAccount = new Map<string, { currency: string; firstUseDate: string }>()
  const conflictingMissingAccounts = new Set<string>()

  for (const [account, info] of opens) {
    if (!isLocked(account)) continue
    if (info.currencies.length !== 1 && !reportedMultiCurrencyOpens.has(account)) {
      reportedMultiCurrencyOpens.add(account)
      issues.push({
        kind: 'multi_currency_open',
        account,
        currencies: info.currencies,
        message:
          info.currencies.length === 0
            ? `${account}: open directive must declare exactly one currency`
            : `${account}: open directive declares ${info.currencies.length} currencies (${info.currencies.join(', ')}); must declare exactly one`,
      })
    }
  }

  for (const txn of transactions) {
    for (const p of txn.postings) {
      if (!p.currency) continue
      if (!isLocked(p.account)) continue
      const open = opens.get(p.account)
      const close = closes.get(p.account)

      if (close && txn.date > close.date) {
        const key = `${p.account}|${close.date}|${txn.date}`
        if (!reportedClosed.has(key)) {
          reportedClosed.add(key)
          issues.push({
            kind: 'closed_account',
            account: p.account,
            closeDate: close.date,
            postingDate: txn.date,
            message: `${p.account}: account closed on ${close.date}, posting on ${txn.date}`,
          })
        }
      }

      if (open) {
        if (open.currencies.length === 1) {
          const expected = open.currencies[0]!
          if (p.currency !== expected) {
            const key = `${p.account}|${expected}|${p.currency}`
            if (!reportedMismatches.has(key)) {
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
        }
      } else {
        const existing = missingByAccount.get(p.account)
        if (existing) {
          if (existing.currency !== p.currency && !conflictingMissingAccounts.has(p.account)) {
            conflictingMissingAccounts.add(p.account)
            issues.push({
              kind: 'multi_currency_open',
              account: p.account,
              currencies: [existing.currency, p.currency],
              message: `${p.account}: postings use multiple currencies (${existing.currency}, ${p.currency}); cannot lock to a single currency`,
            })
          }
          if (txn.date < existing.firstUseDate) existing.firstUseDate = txn.date
        } else {
          missingByAccount.set(p.account, {
            currency: p.currency,
            firstUseDate: txn.date,
          })
        }
      }
    }
  }

  for (const [account, info] of missingByAccount) {
    if (conflictingMissingAccounts.has(account)) continue
    issues.push({
      kind: 'missing_open',
      account,
      currency: info.currency,
      firstUseDate: info.firstUseDate,
      message: `${account}: no open directive; first use ${info.firstUseDate} with ${info.currency}`,
    })
  }

  return issues
}
