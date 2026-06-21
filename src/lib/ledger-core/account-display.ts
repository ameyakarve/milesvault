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
// `Assets:Prepaid:GiftCards:Amazon` files under "Gift cards" and
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
  'Airline miles',
  'Points',
  'Rewards',
  'Status',
  'Credit cards',
  'Bank',
  'Wallets',
  'Forex cards',
  'Gift cards',
  'Prepaid',
  'Debit cards',
  'Cash',
  'Investments',
  'Retirement',
  'Receivable',
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

// Pending children (docs/accounts-taxonomy.md): earned-but-not-credited
// balances live in `<programme>:Pending`. Views fold them into the parent.
export function isPending(account: string): boolean {
  return account.endsWith(':Pending')
}
export function baseAccount(account: string): string {
  return isPending(account) ? account.slice(0, -':Pending'.length) : account
}

// Trailing numeric segments are card/account ids per the taxonomy
// (`Liabilities:CreditCards:<issuer>:<product>[:<id>]`) — shown as a
// de-emphasized suffix, never as the name.
const ID_RE = /^\d{2,}$/

// Row label, convention-aware:
//   Liabilities:CreditCards:Axis:Magnus:1234 → { label: "Axis · Magnus", suffix: "1234" }
//   Assets:Bank:HDFC:Savings                 → { label: "HDFC · Savings" }
//   Assets:Prepaid:GiftCards:Amazon          → { label: "Amazon" }
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
  // Issuer reward pools carry an issuer level (Assets:Rewards:HDFC:…, or the
  // legacy Assets:Rewards:Cards:HDFC:RewardPoints) — the bare leaf collides
  // across issuers, qualify it. Same for any rewards subtree with an extra level.
  if (account.startsWith('Assets:Rewards:') && parts.length >= 5) {
    return { label: `${parts[3]} · ${parts.slice(4).join(':')}`, suffix }
  }
  return { label: parts[parts.length - 1] ?? account, suffix }
}

// The leaf used for KG resolution: the product for cards, the commodity leaf
// for points/status — mirrors matchAccount in points-paths.ts.
export function kgLookupParts(
  account: string,
):
  | { kind: 'card'; issuer: string; product: string }
  | { kind: 'currency'; leaf: string; issuer: string | null }
  | null {
  const parts = account.split(':')
  if (account.startsWith('Liabilities:CreditCards:') && parts.length >= 4) {
    const last = parts[parts.length - 1]
    const product = ID_RE.test(last) ? parts[parts.length - 2] : last
    return { kind: 'card', issuer: parts[2], product }
  }
  if (account.startsWith('Assets:Rewards:') && parts.length >= 4) {
    const base = baseAccount(account).split(':')
    const leaf = base[base.length - 1]
    // Issuer context when present: Cards:<Issuer>:<Pool>, or the legacy
    // shape Assets:Rewards:<Issuer>:<Pool>. Disambiguates generic leaves.
    const SUBTREES = new Set(['Points', 'Miles', 'Cards', 'Status'])
    let issuer: string | null = null
    if (base.length >= 5 && base[2] === 'Cards') issuer = base[3]
    else if (base.length >= 4 && !SUBTREES.has(base[2]) && base.length > 3 && base[2] !== leaf)
      issuer = base[2]
    return { kind: 'currency', leaf, issuer }
  }
  return null
}

// Title-case an all-caps commodity-style leaf for display ("KRISFLYER" →
// "Krisflyer", "HDFC-SMARTBUY" → "Hdfc Smartbuy") — but leave short codes
// ("MR", "AVIOS"… ≤4 chars) untouched: "Mr" would be worse than "MR". The KG
// display name, when resolved, always wins over this fallback.
export function prettyLeaf(leaf: string): string {
  if (leaf.length <= 4) return leaf
  if (leaf === leaf.toUpperCase()) {
    return leaf
      .split(/[-_]/)
      .map((w) => (w ? w[0] + w.slice(1).toLowerCase() : w))
      .join(' ')
  }
  // CamelCase beancount leaves read as words ("MagnusBurgundy" →
  // "Magnus Burgundy"); acronym runs stay intact ("HDFCBank" → "HDFC Bank").
  return leaf
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
}

// One resolution chain for what to call an account, everywhere:
// KG display name → convention-aware path label (prettified).
export function displayName(
  account: string,
  kgNames: Record<string, string>,
): { name: string; suffix: string | null } {
  const kg = kgNames[account]
  const { label, suffix } = accountLabel(account)
  return { name: kg ?? prettyLeaf(label), suffix }
}

// True when showing the currency code next to this name would just repeat it
// ("KrisFlyer · 18,000 KRISFLYER").
export function currencyRedundant(name: string, currency: string): boolean {
  const norm = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return norm(name) === norm(currency) || norm(name).includes(norm(currency))
}
