export type AccountGlyph = {
  text: string
  visualWidth: number
  label: string
  chipLabel: string
}

export const ACCOUNT_GLYPHS: readonly AccountGlyph[] = [
  { text: 'Liabilities:CC', visualWidth: 5, label: 'credit card', chipLabel: 'CC' },
  { text: 'Assets:DC', visualWidth: 5, label: 'debit card', chipLabel: 'DC' },
  { text: 'Assets:Loaded:PrepaidCards', visualWidth: 5, label: 'prepaid card', chipLabel: 'PP' },
  { text: 'Assets:Loaded:ForexCards', visualWidth: 5, label: 'forex card', chipLabel: 'FX' },
  { text: 'Assets:Bank', visualWidth: 7, label: 'bank', chipLabel: 'Bank' },
  { text: 'Assets:Rewards:Points', visualWidth: 9, label: 'rewards points', chipLabel: 'Points' },
  { text: 'Assets:Loaded:Wallets', visualWidth: 9, label: 'wallet', chipLabel: 'Wallet' },
  { text: 'Assets:Loaded:GiftCards', visualWidth: 7, label: 'gift card', chipLabel: 'Gift' },
  { text: 'Assets:Receivables', visualWidth: 6, label: 'receivable', chipLabel: 'Rcv' },
  { text: 'Assets:Cash', visualWidth: 7, label: 'cash', chipLabel: 'Cash' },
  { text: 'Income:Void', visualWidth: 7, label: 'void (source)', chipLabel: 'Void' },
  { text: 'Expenses:Void', visualWidth: 7, label: 'void (sink)', chipLabel: 'Void' },
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
