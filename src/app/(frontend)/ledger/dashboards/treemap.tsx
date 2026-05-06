'use client'

import { hierarchy, treemap as d3Treemap } from 'd3-hierarchy'
import { useMemo } from 'react'
import type { TreemapNode } from '../overview-view'

export type { TreemapNode }

type Props = {
  root: TreemapNode
  width?: number
  height?: number
  palette?: string[]
}

const DEFAULT_PALETTE = [
  '#3b82f6', // blue-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#ef4444', // red-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#ec4899', // pink-500
]

// Two-level squarified treemap: top-level groups inherit a color from the
// palette; their leaf children share the parent hue with a slightly lighter
// fill so the hierarchy reads at a glance.
export function Treemap({ root, width = 720, height = 320, palette = DEFAULT_PALETTE }: Props) {
  const layout = useMemo(() => {
    const h = hierarchy<TreemapNode>(root)
      .sum((d) => (d.children && d.children.length ? 0 : (d.value ?? 0)))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    d3Treemap<TreemapNode>()
      .size([width, height])
      .paddingInner(2)
      .paddingOuter(2)
      // Reserve a strip at the top of each depth=1 group for the header band.
      .paddingTop((d) => (d.depth === 1 ? 16 : 0))
      .round(true)(h)
    return h
  }, [root, width, height])

  // Top-level groups (depth=1). Color index assigned in size order.
  const groups = (layout.children ?? []).map((g, i) => ({
    node: g,
    color: palette[i % palette.length]!,
  }))

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="xMidYMid meet"
      className="block"
    >
      {groups.map(({ node: group, color }, gi) => {
        const x0 = (group as any).x0 as number
        const y0 = (group as any).y0 as number
        const x1 = (group as any).x1 as number
        const y1 = (group as any).y1 as number
        const groupW = x1 - x0
        const groupH = y1 - y0
        const leaves = group.children ?? []
        return (
          <g key={gi}>
            {leaves.map((leaf, li) => {
              const lx0 = (leaf as any).x0 as number
              const ly0 = (leaf as any).y0 as number
              const lx1 = (leaf as any).x1 as number
              const ly1 = (leaf as any).y1 as number
              const lw = lx1 - lx0
              const lh = ly1 - ly0
              const showLabel = lw >= 56 && lh >= 28
              const showAmount = lw >= 80 && lh >= 42
              return (
                <g key={li}>
                  <rect
                    x={lx0}
                    y={ly0}
                    width={lw}
                    height={lh}
                    fill={color}
                    fillOpacity={0.78}
                    stroke="white"
                    strokeWidth={1}
                  />
                  {showLabel && (
                    <text
                      x={lx0 + 8}
                      y={ly0 + 16}
                      fill="white"
                      fontSize={11}
                      fontWeight={600}
                      style={{ pointerEvents: 'none' }}
                    >
                      {leaf.data.name}
                    </text>
                  )}
                  {showAmount && leaf.data.amount && (
                    <text
                      x={lx0 + 8}
                      y={ly0 + 32}
                      fill="white"
                      fillOpacity={0.85}
                      fontSize={10}
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      style={{ pointerEvents: 'none' }}
                    >
                      {leaf.data.amount}
                    </text>
                  )}
                </g>
              )
            })}
            {/* Group header band, drawn on top of leaves so the parent name
                always reads even when leaves fill the rect. */}
            {groupW >= 60 && groupH >= 18 && (
              <>
                <rect
                  x={x0}
                  y={y0}
                  width={groupW}
                  height={16}
                  fill={color}
                  fillOpacity={0.95}
                />
                <text
                  x={x0 + 6}
                  y={y0 + 12}
                  fill="white"
                  fontSize={10}
                  fontWeight={700}
                  style={{ pointerEvents: 'none' }}
                >
                  {group.data.name.toUpperCase()}
                </text>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
