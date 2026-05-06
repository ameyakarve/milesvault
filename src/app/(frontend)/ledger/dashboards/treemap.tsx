'use client'

import { hierarchy, treemap as d3Treemap } from 'd3-hierarchy'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TreemapNode } from '../overview-view'

export type { TreemapNode }

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

type LeafDatum = {
  x1: number
  y1: number
  x2: number
  y2: number
  group: string
  leaf: string
  amount: string
  value: number
  pct: number
  color: string
}

type GroupDatum = { name: string; color: string }

type Props = {
  root: TreemapNode
  height?: number
  palette?: string[]
}

// Two-level squarified treemap. Layout via d3-hierarchy; rendering is
// hand-rolled SVG so we get pixel-accurate hover (Plot.tip pairs with
// Plot.pointer's Euclidean nearest-point search, which flickers as the
// cursor crosses rectangle boundaries — we want "is the cursor inside this
// rect?", not "which center is nearest").
export function Treemap({ root, height = 480, palette = DEFAULT_PALETTE }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [hover, setHover] = useState<{ leaf: LeafDatum; x: number; y: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 720
      if (w > 0) setWidth(Math.round(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { leaves, groups } = useMemo<{ leaves: LeafDatum[]; groups: GroupDatum[] }>(() => {
    const h = hierarchy<TreemapNode>(root)
      .sum((d) => (d.children && d.children.length ? 0 : (d.value ?? 0)))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    const w = Math.max(120, width)
    d3Treemap<TreemapNode>().size([w, height]).paddingInner(3).paddingOuter(0).round(true)(h)
    const groupNodes = h.children ?? []
    const groupColor = new Map<string, string>()
    groupNodes.forEach((g, i) => groupColor.set(g.data.name, palette[i % palette.length]!))
    const total = groupNodes.reduce((s, g) => s + (g.value ?? 0), 0) || 1
    const lvs: LeafDatum[] = []
    for (const g of groupNodes) {
      const color = groupColor.get(g.data.name) ?? palette[0]!
      for (const leaf of g.children ?? []) {
        const r = leaf as unknown as { x0: number; y0: number; x1: number; y1: number }
        const v = leaf.value ?? 0
        lvs.push({
          x1: r.x0,
          y1: r.y0,
          x2: r.x1,
          y2: r.y1,
          group: g.data.name,
          leaf: leaf.data.name,
          amount: leaf.data.amount ?? '',
          value: v,
          pct: (v / total) * 100,
          color,
        })
      }
    }
    const grp: GroupDatum[] = groupNodes.map((g) => ({
      name: g.data.name,
      color: groupColor.get(g.data.name)!,
    }))
    return { leaves: lvs, groups: grp }
  }, [root, width, height, palette])

  const handleMove = (e: React.MouseEvent, leaf: LeafDatum) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover({ leaf, x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div className="w-full">
      <div ref={containerRef} className="relative w-full">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${Math.max(width, 120)} ${height}`}
          preserveAspectRatio="none"
          className="block"
          onMouseLeave={() => setHover(null)}
        >
          {leaves.map((l, i) => {
            const lw = l.x2 - l.x1
            const lh = l.y2 - l.y1
            const showLeaf = lw >= 60 && lh >= 28
            const showAmt = lw >= 92 && lh >= 50
            const showPct = lw >= 60 && lh >= 70
            const pctStr =
              l.pct < 1 ? `${l.pct.toFixed(1)}%` : `${Math.round(l.pct)}%`
            return (
              <g
                key={i}
                onMouseEnter={(e) => handleMove(e, l)}
                onMouseMove={(e) => handleMove(e, l)}
              >
                <rect
                  x={l.x1}
                  y={l.y1}
                  width={lw}
                  height={lh}
                  fill={l.color}
                  fillOpacity={hover?.leaf === l ? 1 : 0.9}
                  stroke="white"
                  strokeWidth={2}
                />
                {showLeaf && (
                  <text
                    x={l.x1 + 10}
                    y={l.y1 + 22}
                    fill="white"
                    fontSize={14}
                    fontWeight={700}
                    style={{ pointerEvents: 'none' }}
                  >
                    {l.leaf}
                  </text>
                )}
                {showAmt && (
                  <text
                    x={l.x1 + 10}
                    y={l.y1 + 42}
                    fill="white"
                    fontSize={12}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    style={{ pointerEvents: 'none' }}
                  >
                    {l.amount}
                  </text>
                )}
                {showPct && (
                  <text
                    x={l.x1 + 10}
                    y={l.y1 + 60}
                    fill="white"
                    fillOpacity={0.85}
                    fontSize={11}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    style={{ pointerEvents: 'none' }}
                  >
                    {pctStr}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        {hover && (
          <div
            className="absolute z-10 pointer-events-none rounded-md bg-white border border-slate-200 shadow-md px-3 py-2 text-[12px] whitespace-nowrap"
            style={{
              left: Math.min(hover.x + 12, (containerRef.current?.clientWidth ?? 0) - 220),
              top: Math.max(hover.y - 56, 4),
            }}
          >
            <div className="font-semibold text-slate-900">
              {hover.leaf.group} <span className="text-slate-300">›</span> {hover.leaf.leaf}
            </div>
            <div className="mt-0.5 font-mono tabular-nums text-slate-700">
              {hover.leaf.amount}
              <span className="ml-2 text-slate-400">
                {hover.leaf.pct < 1
                  ? `${hover.leaf.pct.toFixed(1)}%`
                  : `${Math.round(hover.leaf.pct)}%`}
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-[11px] text-slate-600">
        {groups.map((g) => (
          <div key={g.name} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: g.color }}
            />
            <span>{g.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
