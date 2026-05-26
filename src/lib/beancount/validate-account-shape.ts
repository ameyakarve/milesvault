import type { DirectiveInput, TransactionInput } from '@/durable/ledger-types'

// Structural rules for account names beyond what the parser enforces.
// Currently a single rule: credit card accounts must encode issuer, card
// name, and (optionally) a card id under the Liabilities:CreditCards tree
// so dashboards and downstream taxonomy can split them deterministically.

const CC_ROOT = 'Liabilities:CreditCards'

export type AccountShapeIssue = {
  kind: 'credit_card_format'
  account: string
  message: string
}

function check(account: string, issues: AccountShapeIssue[], seen: Set<string>) {
  if (seen.has(account)) return
  seen.add(account)
  if (account !== CC_ROOT && !account.startsWith(CC_ROOT + ':')) return
  // Required: Liabilities, CreditCards, <Issuer>, <Card>. Optional: <Id>.
  const segments = account.split(':')
  if (segments.length < 4 || segments.length > 5) {
    issues.push({
      kind: 'credit_card_format',
      account,
      message: `${account}: credit card accounts must be Liabilities:CreditCards:<Issuer>:<Card>[:<Id>]`,
    })
  }
}

export function validateAccountShapes(
  transactions: TransactionInput[],
  directives: DirectiveInput[],
): AccountShapeIssue[] {
  const issues: AccountShapeIssue[] = []
  const seen = new Set<string>()
  for (const txn of transactions) {
    for (const p of txn.postings) check(p.account, issues, seen)
  }
  for (const d of directives) {
    if ('account' in d && typeof d.account === 'string') check(d.account, issues, seen)
  }
  return issues
}
