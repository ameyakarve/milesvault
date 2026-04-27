import type { DirectiveInput, TransactionInput } from '@/durable/ledger-types'

export function txnTouchesAccount(txn: TransactionInput, account: string): boolean {
  return txn.postings.some((p) => p.account === account)
}

export function txnTouchesAccountCurrency(
  txn: TransactionInput,
  account: string,
  currency: string,
): boolean {
  return txn.postings.some((p) => p.account === account && p.currency === currency)
}

export function directiveTouchesAccount(d: DirectiveInput, account: string): boolean {
  switch (d.kind) {
    case 'open':
    case 'close':
    case 'balance':
    case 'note':
    case 'document':
      return d.account === account
    case 'pad':
      return d.account === account || d.account_pad === account
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
      if (d.account !== account) return false
      if (!d.constraint_currencies || d.constraint_currencies.length === 0) return true
      return d.constraint_currencies.includes(currency)
    case 'close':
    case 'note':
    case 'document':
      return d.account === account
    case 'pad':
      return d.account === account || d.account_pad === account
    case 'balance':
      return d.account === account && d.currency === currency
    case 'commodity':
    case 'price':
    case 'event':
      return false
  }
}
