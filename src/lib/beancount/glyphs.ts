export type AccountGlyph = {
  text: string
  visualWidth: number
  label: string
}

export const ACCOUNT_GLYPHS: readonly AccountGlyph[] = [
  { text: 'Liabilities:CC:', visualWidth: 2, label: 'credit card' },
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
