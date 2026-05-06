import type { TreemapNode } from '../overview-view'

export const CURRENCY_SYMBOL: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
}

// Categorical palette for the category treemap. Picked for high pairwise
// contrast at the saturation Mantine renders treemap rectangles at.
export const TREEMAP_PALETTE = [
  '#0f766e', // teal-700
  '#7c3aed', // violet-600
  '#ea580c', // orange-600
  '#0284c7', // sky-600
  '#dc2626', // red-600
  '#ca8a04', // yellow-600
  '#65a30d', // lime-600
  '#db2777', // pink-600
  '#475569', // slate-600
]

// Mantine's Treemap propagates `color` from parent to child, so painting
// each top-level branch is enough — leaves inherit. Without this the chart
// falls back to mantine-blue-{1..9} which reads as monochrome.
export function colorizeTreemap(
  node: TreemapNode,
  palette: string[] = TREEMAP_PALETTE,
): TreemapNode {
  if (!node.children) return node
  return {
    ...node,
    children: node.children.map((child, i) => paintBranch(child, palette[i % palette.length]!)),
  }
}

function paintBranch(node: TreemapNode, color: string): TreemapNode {
  return {
    ...node,
    color,
    children: node.children?.map((c) => paintBranch(c, color)),
  }
}

const CURRENCY_LOCALE: Record<string, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
}

// Full-precision currency string with locale-correct grouping and the
// currency symbol prefixed. Negative values get an ASCII '-' prefix.
export function formatAmount(n: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? ''
  const locale = CURRENCY_LOCALE[currency] ?? 'en-US'
  const body = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n))
  return `${n < 0 ? '-' : ''}${symbol}${body}`
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
