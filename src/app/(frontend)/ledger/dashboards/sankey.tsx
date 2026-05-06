'use client'

import { sankey, sankeyLeft, sankeyLinkHorizontal } from 'd3-sankey'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SankeyDatum } from '../overview-view'

const SOURCE_COLOR = '#0ea5e9'
const CARD_COLOR = '#475569'
const CATEGORY_COLOR = '#f97316'
const LINK_COLOR_IN = '#0ea5e9'
const LINK_COLOR_OUT = '#f97316'

type Node = {
  name: string
  side: 'source' | 'card' | 'category'
  index?: number
  x0?: number
  x1?: number
  y0?: number
  y1?: number
  value?: number
}

type Link = {
  source: number | Node
  target: number | Node
  value: number
  amount: string
  width?: number
  y0?: number
  y1?: number
}

type HoverState = { kind: 'link'; link: Link; x: number; y: number } | null

type Props = {
  data: SankeyDatum
  height?: number
}

// Three-column sankey: payment sources → card → expense categories. Layout
// uses d3-sankey; rendering is hand-rolled SVG so hover works rect-by-rect
// (Plot.tip pairs with Plot.pointer's nearest-center search, which flickers
// across rectangle edges on a layout this dense).
export function Sankey({ data, height = 360 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [hover, setHover] = useState<HoverState>(null)

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

  const layout = useMemo(() => {
    const w = Math.max(360, width)
    const nodes: Node[] = data.nodes.map((n) => ({ ...n }))
    const links: Link[] = data.links.map((l) => ({ ...l }))
    const generator = sankey<Node, Link>()
      .nodeWidth(14)
      .nodePadding(10)
      .nodeAlign(sankeyLeft)
      .extent([
        [8, 8],
        [w - 8, height - 8],
      ])
    return generator({ nodes, links })
  }, [data, width, height])

  const linkPath = useMemo(() => sankeyLinkHorizontal<Node, Link>(), [])

  const handleLinkMove = (e: React.MouseEvent, link: Link) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover({ kind: 'link', link, x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const colorFor = (n: Node): string =>
    n.side === 'source' ? SOURCE_COLOR : n.side === 'card' ? CARD_COLOR : CATEGORY_COLOR

  const linkColor = (l: Link): string => {
    const t = (l.target as Node).side
    return t === 'card' ? LINK_COLOR_IN : LINK_COLOR_OUT
  }

  return (
    <div className="w-full">
      <div ref={containerRef} className="relative w-full">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${Math.max(width, 360)} ${height}`}
          preserveAspectRatio="none"
          className="block"
          onMouseLeave={() => setHover(null)}
        >
          <g fill="none">
            {layout.links.map((l, i) => (
              <path
                key={i}
                d={linkPath(l) ?? undefined}
                stroke={linkColor(l)}
                strokeOpacity={hover?.kind === 'link' && hover.link === l ? 0.7 : 0.32}
                strokeWidth={Math.max(1, l.width ?? 1)}
                onMouseEnter={(e) => handleLinkMove(e, l)}
                onMouseMove={(e) => handleLinkMove(e, l)}
                style={{ cursor: 'pointer' }}
              />
            ))}
          </g>
          <g>
            {layout.nodes.map((n, i) => {
              const w = (n.x1 ?? 0) - (n.x0 ?? 0)
              const h = (n.y1 ?? 0) - (n.y0 ?? 0)
              return (
                <rect
                  key={i}
                  x={n.x0}
                  y={n.y0}
                  width={w}
                  height={h}
                  fill={colorFor(n)}
                  stroke="white"
                  strokeWidth={1}
                />
              )
            })}
          </g>
          <g>
            {layout.nodes.map((n, i) => {
              const x = (n.x0 ?? 0) < width / 2 ? (n.x1 ?? 0) + 6 : (n.x0 ?? 0) - 6
              const anchor = (n.x0 ?? 0) < width / 2 ? 'start' : 'end'
              const y = ((n.y0 ?? 0) + (n.y1 ?? 0)) / 2
              return (
                <text
                  key={i}
                  x={x}
                  y={y}
                  dy="0.35em"
                  textAnchor={anchor}
                  fontSize={11}
                  fill="#334155"
                  style={{ pointerEvents: 'none' }}
                >
                  {n.name}
                </text>
              )
            })}
          </g>
        </svg>
        {hover && hover.kind === 'link' && (
          <div
            className="absolute z-10 pointer-events-none rounded-md bg-white border border-slate-200 shadow-md px-3 py-2 text-[12px] whitespace-nowrap"
            style={{
              left: Math.min(hover.x + 12, (containerRef.current?.clientWidth ?? 0) - 240),
              top: Math.max(hover.y - 56, 4),
            }}
          >
            <div className="font-semibold text-slate-900">
              {(hover.link.source as Node).name}{' '}
              <span className="text-slate-300">→</span>{' '}
              {(hover.link.target as Node).name}
            </div>
            <div className="mt-0.5 font-mono tabular-nums text-slate-700">
              {hover.link.amount}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-[11px] text-slate-600">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: SOURCE_COLOR }} />
          <span>Paid from</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CARD_COLOR }} />
          <span>Card</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CATEGORY_COLOR }} />
          <span>Spent on</span>
        </div>
      </div>
    </div>
  )
}
