import { ANY_ACCOUNT_RE, resolveAccount } from './accounts'

export function chipVisualWidth(chipLabel: string): number {
  return chipLabel.length + 3
}

export function toChipSvg(raw: string): string {
  return raw
    .replace('width="24"', 'width="14"')
    .replace('height="24"', 'height="14"')
    .replace('stroke-width="2"', 'stroke-width="1.75"')
}

export function visualTextLen(s: string): number {
  let delta = 0
  for (const match of s.matchAll(ANY_ACCOUNT_RE)) {
    const r = resolveAccount(match[0])
    if (!r || !r.glyph) continue
    delta += chipVisualWidth(r.chipLabel) - r.consumedLen
  }
  return s.length + delta
}
