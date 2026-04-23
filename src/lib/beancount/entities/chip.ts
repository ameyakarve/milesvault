export function chipVisualWidth(chipLabel: string, hasSvg = true): number {
  return chipLabel.length + (hasSvg ? 3 : 1)
}

export function chipSlotWidth(rawLen: number, chipLabel: string): number {
  return Math.max(rawLen, chipVisualWidth(chipLabel))
}

export function toChipSvg(raw: string): string {
  return raw
    .trim()
    .replace('width="24"', 'width="1em"')
    .replace('height="24"', 'height="1em"')
    .replace('stroke-width="2"', 'stroke-width="1.75"')
}
