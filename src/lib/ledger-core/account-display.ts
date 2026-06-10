import { findTaxonomyNode, prefixChain } from './taxonomy'

// Convention-aware presentation of account paths for the Vault and the
// per-account overview (docs/accounts-taxonomy.md). Pure path logic — KG
// display names (resolved per held account) override these labels upstream.

// The Vault shows holdings: Assets + Liabilities. Income/Expenses are flows,
// Equity is plumbing (Opening-Balances, Void), and the system plug accounts
// never belong on a dashboard.
export function isHolding(account: string): boolean {
  return account.startsWith('Assets:') || account.startsWith('Liabilities:')
}

// Group heading: the deepest taxonomy node on the prefix chain, so
// `Assets:Loaded:Wallets:Paytm` files under "Wallets" and
// `Liabilities:CreditCards:Axis:Magnus` under "Credit cards".
export function groupLabel(account: string): string {
  for (const prefix of prefixChain(account)) {
    const node = findTaxonomyNode(prefix)
    if (node) return node.label
  }
  return account.split(':')[0] ?? account
}

// Vault group order — rewards first (the product), then spend instruments,
// then the balance-sheet rest. Unknown groups sort after, alphabetically.
const GROUP_ORDER = [
  'Points',
  'Status',
  'Credit cards',
  'Bank',
  'Wallets',
  'Prepaid cards',
  'Gift cards',
  'Forex cards',
  'Debit cards',
  'Cash',
  'Stored value',
  'Investments',
  'Retirement',
  'Receivable',
  'Prepaid',
  'Mortgage',
  'Auto',
  'Student',
  'Personal',
  'Loans',
  'Payable',
]
export function groupRank(label: string): number {
  const i = GROUP_ORDER.indexOf(label)
  return i === -1 ? GROUP_ORDER.length : i
}

// Trailing numeric segments are card/account ids per the taxonomy
// (`Liabilities:CreditCards:<issuer>:<product>[:<id>]`) — shown as a
// de-emphasized suffix, never as the name.
const ID_RE = /^\d{2,}$/

// Row label, convention-aware:
//   Liabilities:CreditCards:Axis:Magnus:1234 → { label: "Axis · Magnus", suffix: "1234" }
//   Assets:Bank:HDFC:Savings                 → { label: "HDFC · Savings" }
//   Assets:Loaded:Wallets:Paytm              → { label: "Paytm" }
//   Assets:Rewards:Points:KRISFLYER          → { label: "KRISFLYER" }
export function accountLabel(account: string): { label: string; suffix: string | null } {
  const parts = account.split(':')
  let suffix: string | null = null
  if (parts.length > 1 && ID_RE.test(parts[parts.length - 1])) {
    suffix = parts[parts.length - 1]
    parts.pop()
  }
  if (
    (account.startsWith('Liabilities:CreditCards:') || account.startsWith('Assets:Bank:')) &&
    parts.length >= 4
  ) {
    // <root>:<group>:<institution>:<name…> → "Institution · Name"
    return { label: `${parts[2]} · ${parts.slice(3).join(':')}`, suffix }
  }
  return { label: parts[parts.length - 1] ?? account, suffix }
}

// The leaf used for KG resolution: the product for cards, the commodity leaf
// for points/status — mirrors matchAccount in points-paths.ts.
export function kgLookupParts(
  account: string,
): { kind: 'card'; issuer: string; product: string } | { kind: 'currency'; leaf: string } | null {
  const parts = account.split(':')
  if (account.startsWith('Liabilities:CreditCards:') && parts.length >= 4) {
    const last = parts[parts.length - 1]
    const product = ID_RE.test(last) ? parts[parts.length - 2] : last
    return { kind: 'card', issuer: parts[2], product }
  }
  if (account.startsWith('Assets:Rewards:') && parts.length >= 4) {
    return { kind: 'currency', leaf: parts[parts.length - 1] }
  }
  return null
}
