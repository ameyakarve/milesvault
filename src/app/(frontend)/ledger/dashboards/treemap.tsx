'use client'

import * as Plot from '@observablehq/plot'
import { hierarchy, treemap as d3Treemap } from 'd3-hierarchy'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TreemapNode } from '../overview-view'
import { PlotChart } from './plot-chart'

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
  cx: number
  cy: number
  group: string
  leaf: string
  amount: string
  color: string
  tooltip: string
}

type GroupDatum = { name: string; color: string; total: number; amount: string }

type Props = {
  root: TreemapNode
  height?: number
  palette?: string[]
}

// Two-level squarified treemap. Layout via d3-hierarchy; render via
// Plot.rect + Plot.text + Plot.tip so the visual matches the rest of the
// dashboards and we get hover tooltips for free. Group identity is encoded
// only by color + a legend strip below — no header bands, which avoids the
// padding/alignment mismatch with the leaf rectangles.
export function Treemap({ root, height = 460, palette = DEFAULT_PALETTE }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)

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
    d3Treemap<TreemapNode>()
      .size([w, height])
      .paddingInner(3)
      .paddingOuter(0)
      .round(true)(h)
    const groupNodes = h.children ?? []
    const groupColor = new Map<string, string>()
    groupNodes.forEach((g, i) => groupColor.set(g.data.name, palette[i % palette.length]!))
    const lvs: LeafDatum[] = []
    for (const g of groupNodes) {
      const color = groupColor.get(g.data.name) ?? palette[0]!
      for (const leaf of g.children ?? []) {
        const r = leaf as unknown as { x0: number; y0: number; x1: number; y1: number }
        const x1 = r.x0
        const y1 = r.y0
        const x2 = r.x1
        const y2 = r.y1
        lvs.push({
          x1,
          y1,
          x2,
          y2,
          cx: (x1 + x2) / 2,
          cy: (y1 + y2) / 2,
          group: g.data.name,
          leaf: leaf.data.name,
          amount: leaf.data.amount ?? '',
          color,
          tooltip: `${g.data.name} · ${leaf.data.name}${leaf.data.amount ? `\n${leaf.data.amount}` : ''}`,
        })
      }
    }
    const grpSummary: GroupDatum[] = groupNodes.map((g) => ({
      name: g.data.name,
      color: groupColor.get(g.data.name)!,
      total: g.value ?? 0,
      amount: '',
    }))
    return { leaves: lvs, groups: grpSummary }
  }, [root, width, height, palette])

  const render = useCallback(() => {
    if (leaves.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'p-6 text-[11px] text-slate-400'
      empty.textContent = 'No spending in selected range'
      return empty
    }
    const labelLeaves = leaves.filter((l) => l.x2 - l.x1 >= 64 && l.y2 - l.y1 >= 28)
    const amountLeaves = leaves.filter((l) => l.x2 - l.x1 >= 80 && l.y2 - l.y1 >= 46)
    return Plot.plot({
      width,
      height,
      margin: 0,
      style: { background: 'transparent', fontFamily: 'inherit' },
      x: { axis: null, domain: [0, Math.max(width, 120)] },
      // Reverse so d3-treemap's y=0 (top of layout) maps to top of SVG.
      y: { axis: null, domain: [height, 0] },
      marks: [
        Plot.rect(leaves, {
          x1: 'x1',
          x2: 'x2',
          y1: 'y1',
          y2: 'y2',
          fill: 'color',
          fillOpacity: 0.88,
          stroke: 'white',
          strokeWidth: 2,
        }),
        Plot.text(labelLeaves, {
          x: (d: LeafDatum) => d.x1 + 8,
          y: (d: LeafDatum) => d.y1 + 6,
          text: 'leaf',
          textAnchor: 'start',
          // dy after the y-domain reverse pulls baseline downward in screen space.
          dy: 12,
          fill: 'white',
          fontSize: 12,
          fontWeight: 700,
          stroke: 'rgba(0, 0, 0, 0.35)',
          strokeWidth: 3,
          paintOrder: 'stroke fill',
        } as Plot.TextOptions),
        Plot.text(amountLeaves, {
          x: (d: LeafDatum) => d.x1 + 8,
          y: (d: LeafDatum) => d.y1 + 22,
          text: 'amount',
          textAnchor: 'start',
          dy: 12,
          fill: 'white',
          fillOpacity: 0.92,
          fontSize: 10.5,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          stroke: 'rgba(0, 0, 0, 0.3)',
          strokeWidth: 2.5,
          paintOrder: 'stroke fill',
        } as Plot.TextOptions),
        Plot.tip(
          leaves,
          Plot.pointer({
            x: 'cx',
            y: 'cy',
            title: 'tooltip',
          }),
        ),
      ],
    })
  }, [leaves, width, height])

  return (
    <div className="w-full">
      <div ref={containerRef} className="w-full">
        <PlotChart render={render} className="w-full" />
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
