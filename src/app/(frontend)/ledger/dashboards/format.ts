export const CURRENCY_SYMBOL: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
}

// Compact short-form for axis tick labels. Indian locales get L (lakh) and Cr
// (crore) suffixes; everything else falls back to k/M/B SI suffixes.
export function compactAmount(n: number, currency: string): string {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (currency === 'INR') {
    if (a >= 1e7) return `${sign}${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1).replace(/\.0$/, '')}Cr`
    if (a >= 1e5) return `${sign}${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1).replace(/\.0$/, '')}L`
    if (a >= 1e3) return `${sign}${Math.round(a / 1e3)}k`
    return `${sign}${a}`
  }
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '')}B`
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`
  if (a >= 1e3) return `${sign}${Math.round(a / 1e3)}k`
  return `${sign}${a}`
}
