export function chipVisualWidth(chipLabel: string): number {
  return chipLabel.length + 3
}

export function chipSlotWidth(rawLen: number, chipLabel: string): number {
  return Math.max(rawLen, chipVisualWidth(chipLabel))
}

export function toChipSvg(raw: string): string {
  return raw
    .replace('width="24"', 'width="14"')
    .replace('height="24"', 'height="14"')
    .replace('stroke-width="2"', 'stroke-width="1.75"')
}
