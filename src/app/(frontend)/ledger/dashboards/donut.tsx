'use client'

import type { CompositionRow } from '../overview-view'

// Categorical palette for donut slices — Tableau-style, Tailwind-aligned.
// Ordered so adjacent slices have high contrast.
export const DONUT_PALETTE = [
  '#3b82f6', // blue-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#ef4444', // red-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#ec4899', // pink-500
]

type Props = {
  rows: CompositionRow[]
  palette?: string[]
}

// Hand-rolled SVG donut + legend. Each row is a slice sized by row.value;
// the legend below maps colors to leaf names + amount strings. Single-row
// data renders as a complete annulus (no slice math).
export function Donut({ rows, palette = DONUT_PALETTE }: Props) {
  const total = rows.reduce((acc, r) => acc + (r.value ?? 0), 0)
  if (total <= 0) return null
  const size = 160
  const cx = size / 2
  const cy = size / 2
  const outer = 70
  const inner = 42
  let angle = -Math.PI / 2
  const segments = rows.map((row, i) => {
    const fraction = (row.value ?? 0) / total
    const start = angle
    const end = angle + fraction * 2 * Math.PI
    angle = end
    return {
      row,
      color: palette[i % palette.length]!,
      path:
        rows.length === 1
          ? fullAnnulus(cx, cy, inner, outer)
          : describeArc(cx, cy, inner, outer, start, end),
      fraction,
    }
  })
  return (
    <div className="flex flex-col items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {segments.map((seg, i) => (
          <path
            key={i}
            d={seg.path}
            fill={seg.color}
            fillRule={rows.length === 1 ? 'evenodd' : undefined}
            stroke="white"
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <div className="w-full flex flex-col gap-1.5 text-[12px] min-w-0">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: seg.color }}
            />
            <span className="flex-1 truncate text-slate-700">{seg.row.leaf}</span>
            <span className={`font-mono tabular-nums shrink-0 ${seg.row.amountClass}`}>
              {seg.row.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function describeArc(
  cx: number,
  cy: number,
  ri: number,
  ro: number,
  a0: number,
  a1: number,
): string {
  const x0 = cx + ro * Math.cos(a0)
  const y0 = cy + ro * Math.sin(a0)
  const x1 = cx + ro * Math.cos(a1)
  const y1 = cy + ro * Math.sin(a1)
  const x2 = cx + ri * Math.cos(a1)
  const y2 = cy + ri * Math.sin(a1)
  const x3 = cx + ri * Math.cos(a0)
  const y3 = cy + ri * Math.sin(a0)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M ${x0} ${y0} A ${ro} ${ro} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${ri} ${ri} 0 ${large} 0 ${x3} ${y3} Z`
}

function fullAnnulus(cx: number, cy: number, ri: number, ro: number): string {
  return (
    `M ${cx + ro} ${cy} A ${ro} ${ro} 0 1 1 ${cx - ro} ${cy} A ${ro} ${ro} 0 1 1 ${cx + ro} ${cy} Z` +
    `M ${cx + ri} ${cy} A ${ri} ${ri} 0 1 0 ${cx - ri} ${cy} A ${ri} ${ri} 0 1 0 ${cx + ri} ${cy} Z`
  )
}
