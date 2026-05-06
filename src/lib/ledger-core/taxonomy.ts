// Account taxonomy — the canonical TS encoding of docs/accounts-taxonomy.md.
//
// Each TaxonomyNode is a prefix in the colon-delimited account tree. A
// `dashboard` binding applies to the prefix itself and to all descendants
// (self+descendants) unless a more-specific descendant binding overrides it.
// Resolution walks the prefix chain longest → shortest and returns the first
// binding it finds, so deeper bindings naturally win.
//
// `kind` is the AccountKind classification used by the directory chips and
// elsewhere. It mirrors the first path segment.

export type AccountKind = 'Assets' | 'Liabilities' | 'Equity' | 'Income' | 'Expenses'

export type DashboardBinding = {
  slug: string
}

export type TaxonomyNode = {
  prefix: string
  label: string
  kind: AccountKind
  children?: TaxonomyNode[]
  dashboard?: DashboardBinding
}

export const TAXONOMY: ReadonlyArray<TaxonomyNode> = [
  {
    prefix: 'Assets',
    label: 'Assets',
    kind: 'Assets',
    dashboard: { slug: 'net-worth' },
    children: [
      {
        prefix: 'Assets:Bank',
        label: 'Bank',
        kind: 'Assets',
        dashboard: { slug: 'bank-overview' },
      },
      { prefix: 'Assets:Cash', label: 'Cash', kind: 'Assets' },
      {
        prefix: 'Assets:Investments',
        label: 'Investments',
        kind: 'Assets',
        dashboard: { slug: 'investments' },
      },
      { prefix: 'Assets:Retirement', label: 'Retirement', kind: 'Assets' },
      { prefix: 'Assets:Receivable', label: 'Receivable', kind: 'Assets' },
      { prefix: 'Assets:Prepaid', label: 'Prepaid', kind: 'Assets' },
      { prefix: 'Assets:DebitCards', label: 'Debit cards', kind: 'Assets' },
      {
        prefix: 'Assets:Loaded',
        label: 'Stored value',
        kind: 'Assets',
        children: [
          { prefix: 'Assets:Loaded:Wallets', label: 'Wallets', kind: 'Assets' },
          { prefix: 'Assets:Loaded:PrepaidCards', label: 'Prepaid cards', kind: 'Assets' },
          { prefix: 'Assets:Loaded:GiftCards', label: 'Gift cards', kind: 'Assets' },
          { prefix: 'Assets:Loaded:ForexCards', label: 'Forex cards', kind: 'Assets' },
        ],
      },
      {
        prefix: 'Assets:Rewards',
        label: 'Rewards',
        kind: 'Assets',
        children: [
          { prefix: 'Assets:Rewards:Points', label: 'Points', kind: 'Assets' },
          { prefix: 'Assets:Rewards:Status', label: 'Status', kind: 'Assets' },
        ],
      },
    ],
  },
  {
    prefix: 'Liabilities',
    label: 'Liabilities',
    kind: 'Liabilities',
    children: [
      {
        prefix: 'Liabilities:CreditCards',
        label: 'Credit cards',
        kind: 'Liabilities',
        dashboard: { slug: 'credit-card' },
      },
      {
        prefix: 'Liabilities:Loan',
        label: 'Loans',
        kind: 'Liabilities',
        children: [
          { prefix: 'Liabilities:Loan:Mortgage', label: 'Mortgage', kind: 'Liabilities' },
          { prefix: 'Liabilities:Loan:Auto', label: 'Auto', kind: 'Liabilities' },
          { prefix: 'Liabilities:Loan:Student', label: 'Student', kind: 'Liabilities' },
          { prefix: 'Liabilities:Loan:Personal', label: 'Personal', kind: 'Liabilities' },
        ],
      },
      { prefix: 'Liabilities:Payable', label: 'Payable', kind: 'Liabilities' },
    ],
  },
  {
    prefix: 'Equity',
    label: 'Equity',
    kind: 'Equity',
    children: [
      { prefix: 'Equity:Opening-Balances', label: 'Opening balances', kind: 'Equity' },
      { prefix: 'Equity:Void', label: 'Void', kind: 'Equity' },
    ],
  },
  {
    prefix: 'Income',
    label: 'Income',
    kind: 'Income',
    dashboard: { slug: 'income' },
    children: [
      { prefix: 'Income:Salary', label: 'Salary', kind: 'Income' },
      { prefix: 'Income:Bonus', label: 'Bonus', kind: 'Income' },
      { prefix: 'Income:Interest', label: 'Interest', kind: 'Income' },
      { prefix: 'Income:Dividend', label: 'Dividend', kind: 'Income' },
      { prefix: 'Income:Gift', label: 'Gift', kind: 'Income' },
      { prefix: 'Income:Void', label: 'Void', kind: 'Income' },
    ],
  },
  {
    prefix: 'Expenses',
    label: 'Expenses',
    kind: 'Expenses',
    dashboard: { slug: 'spending' },
    children: [
      { prefix: 'Expenses:Housing', label: 'Housing', kind: 'Expenses' },
      { prefix: 'Expenses:Food', label: 'Food', kind: 'Expenses' },
      { prefix: 'Expenses:Transport', label: 'Transport', kind: 'Expenses' },
      { prefix: 'Expenses:Health', label: 'Health', kind: 'Expenses' },
      { prefix: 'Expenses:Shopping', label: 'Shopping', kind: 'Expenses' },
      { prefix: 'Expenses:Entertainment', label: 'Entertainment', kind: 'Expenses' },
      { prefix: 'Expenses:Personal', label: 'Personal', kind: 'Expenses' },
      { prefix: 'Expenses:Financial', label: 'Financial', kind: 'Expenses' },
      { prefix: 'Expenses:Travel', label: 'Travel', kind: 'Expenses' },
      { prefix: 'Expenses:Misc', label: 'Misc', kind: 'Expenses' },
      { prefix: 'Expenses:Void', label: 'Void', kind: 'Expenses' },
    ],
  },
]

const NODES_BY_PREFIX: ReadonlyMap<string, TaxonomyNode> = (() => {
  const m = new Map<string, TaxonomyNode>()
  const visit = (n: TaxonomyNode) => {
    m.set(n.prefix, n)
    n.children?.forEach(visit)
  }
  TAXONOMY.forEach(visit)
  return m
})()

export function findTaxonomyNode(prefix: string): TaxonomyNode | undefined {
  return NODES_BY_PREFIX.get(prefix)
}

// Yields the prefix chain longest → shortest. For `Assets:Bank:HDFC:Savings`:
// `Assets:Bank:HDFC:Savings`, `Assets:Bank:HDFC`, `Assets:Bank`, `Assets`.
export function prefixChain(account: string): string[] {
  const parts = account.split(':')
  const out: string[] = []
  for (let i = parts.length; i > 0; i--) {
    out.push(parts.slice(0, i).join(':'))
  }
  return out
}

// Resolves the dashboard for an account by walking the prefix chain longest →
// shortest and returning the first binding it hits. Bindings on a node apply
// to that node and all descendants (self+descendants), so a more-specific
// binding on a child naturally overrides a parent binding.
export function resolveDashboard(account: string): DashboardBinding | null {
  for (const prefix of prefixChain(account)) {
    const node = NODES_BY_PREFIX.get(prefix)
    if (node?.dashboard) return node.dashboard
  }
  return null
}

export function classifyKind(account: string): AccountKind | null {
  const head = account.split(':')[0]
  switch (head) {
    case 'Assets':
    case 'Liabilities':
    case 'Equity':
    case 'Income':
    case 'Expenses':
      return head
    default:
      return null
  }
}
