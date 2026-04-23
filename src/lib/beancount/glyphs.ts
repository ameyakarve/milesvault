export type AccountGlyph = {
  text: string
  visualWidth: number
  label: string
}

export const ACCOUNT_GLYPHS: readonly AccountGlyph[] = [
  { text: 'Liabilities:CC:', visualWidth: 3, label: 'credit card' },
  { text: 'Assets:DC:', visualWidth: 3, label: 'debit card' },
  { text: 'Assets:Loaded:PrepaidCards:', visualWidth: 3, label: 'prepaid card' },
  { text: 'Assets:Loaded:ForexCards:', visualWidth: 3, label: 'forex card' },
  { text: 'Assets:Bank:', visualWidth: 3, label: 'bank' },
  { text: 'Assets:Rewards:Points:', visualWidth: 3, label: 'rewards points' },
  { text: 'Assets:Loaded:Wallets:', visualWidth: 3, label: 'wallet' },
  { text: 'Assets:Loaded:GiftCards:', visualWidth: 3, label: 'gift card' },
  { text: 'Assets:Receivables:', visualWidth: 3, label: 'receivable' },
  { text: 'Assets:Cash', visualWidth: 3, label: 'cash' },
]

export function visualTextLen(s: string): number {
  let delta = 0
  for (const g of ACCOUNT_GLYPHS) {
    if (g.text.length === 0) continue
    let idx = 0
    while ((idx = s.indexOf(g.text, idx)) !== -1) {
      delta += g.visualWidth - g.text.length
      idx += g.text.length
    }
  }
  return s.length + delta
}
