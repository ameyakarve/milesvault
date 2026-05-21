export const FALLBACK_COLORS = [
  'teal.6',
  'violet.5',
  'blue.5',
  'orange.5',
  'pink.5',
  'lime.6',
  'cyan.6',
  'gray.6',
]

export function pickColor(provided: string | undefined, index: number): string {
  return provided ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

export function makeFormatter(
  valueFormat: 'currency' | 'number' | undefined,
  currency: string | undefined,
): (n: number) => string {
  if (valueFormat === 'currency') {
    const f = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    })
    return (n) => f.format(n)
  }
  const f = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
  return (n) => f.format(n)
}
