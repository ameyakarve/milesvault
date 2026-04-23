export type AccountGlyph = {
  text: string
  visualWidth: number
  label: string
}

export const ACCOUNT_GLYPHS: readonly AccountGlyph[] = [
  { text: 'Liabilities:CC:', visualWidth: 2, label: 'credit card' },
  { text: 'Assets:Bank:', visualWidth: 2, label: 'bank' },
  { text: 'Assets:Loaded:Wallets:', visualWidth: 2, label: 'wallet' },
  { text: 'Assets:Loaded:GiftCards:', visualWidth: 2, label: 'gift card' },
  { text: 'Assets:Receivables:', visualWidth: 2, label: 'receivable' },
  { text: 'Assets:Cash', visualWidth: 2, label: 'cash' },
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
