import type { DirectiveInput, TransactionInput } from '@/durable/ledger-types'

// Account `a` matches `prefix` iff it equals the prefix exactly, or it is a
// strict descendant in the colon-delimited account tree. `HSBCBank` is NOT a
// descendant of `HSBC` because the next character after the prefix must be `:`
// (or end-of-string).
export function accountMatchesPrefix(a: string, prefix: string): boolean {
  return a === prefix || a.startsWith(prefix + ':')
}

export function txnTouchesAccount(txn: TransactionInput, account: string): boolean {
  return txn.postings.some((p) => accountMatchesPrefix(p.account, account))
}

export function txnTouchesAccountCurrency(
  txn: TransactionInput,
  account: string,
  currency: string,
): boolean {
  return txn.postings.some(
    (p) => accountMatchesPrefix(p.account, account) && p.currency === currency,
  )
}

export function directiveTouchesAccount(d: DirectiveInput, account: string): boolean {
  switch (d.kind) {
    case 'open':
    case 'close':
    case 'balance':
    case 'note':
    case 'document':
      return accountMatchesPrefix(d.account, account)
    case 'pad':
      return (
        accountMatchesPrefix(d.account, account) ||
        accountMatchesPrefix(d.account_pad, account)
      )
    case 'commodity':
    case 'price':
    case 'event':
      return false
  }
}

export function directiveTouchesAccountCurrency(
  d: DirectiveInput,
  account: string,
  currency: string,
): boolean {
  switch (d.kind) {
    case 'open':
      if (!accountMatchesPrefix(d.account, account)) return false
      if (!d.constraint_currencies || d.constraint_currencies.length === 0) return true
      return d.constraint_currencies.includes(currency)
    case 'close':
    case 'note':
    case 'document':
      return accountMatchesPrefix(d.account, account)
    case 'pad':
      return (
        accountMatchesPrefix(d.account, account) ||
        accountMatchesPrefix(d.account_pad, account)
      )
    case 'balance':
      return accountMatchesPrefix(d.account, account) && d.currency === currency
    case 'commodity':
    case 'price':
    case 'event':
      return false
  }
}
