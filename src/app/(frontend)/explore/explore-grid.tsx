'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PostingSearchRow } from '@/lib/ledger-core/posting-search'
import { buildGrid, type FacetConfig, type FacetKind } from './facets'
import { cellNarrow, type DraftPatch } from './cell-narrow'

const DEBIT = '#e11d48' // rose-600
const CREDIT = '#0d9488' // teal-600
const AXIS = '#94a3b8' // slate-400
const GRID = '#e2e8f0' // slate-200
const HEADER_HEIGHT = 40
const LEFT_GUTTER = 120

export type GridControls = {
  x: FacetConfig
  y: FacetConfig
}

export function ExploreGrid({
  rows,
  controls,
  setControls,
  onNarrow,
}: {
  rows: PostingSearchRow[]
  controls: GridControls
  setControls: (next: GridControls) => void
  onNarrow: (patch: DraftPatch) => void
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <FacetControls controls={controls} setControls={setControls} />
      <GridCanvas rows={rows} controls={controls} onNarrow={onNarrow} />
    </div>
  )
}

function FacetControls({
  controls,
  setControls,
}: {
  controls: GridControls
  setControls: (next: GridControls) => void
}) {
  return (
    <div className="flex items-center gap-4 border-b border-slate-200 px-6 py-2 text-xs">
      <FacetPicker
        label="X"
        cfg={controls.x}
        onChange={(x) => setControls({ ...controls, x })}
      />
      <FacetPicker
        label="Y"
        cfg={controls.y}
        onChange={(y) => setControls({ ...controls, y })}
      />
    </div>
  )
}

function FacetPicker({
  label,
  cfg,
  onChange,
}: {
  label: string
  cfg: FacetConfig
  onChange: (next: FacetConfig) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-400">{label}</span>
      <select
        value={cfg.kind}
        onChange={(e) => onChange({ ...cfg, kind: e.target.value as FacetKind })}
        className="rounded-[6px] border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-teal-500"
      >
        <option value="none">(none)</option>
        <option value="month">Month</option>
        <option value="quarter">Quarter</option>
        <option value="year">Year</option>
        <option value="weekday">Day of week</option>
        <option value="account_child">Account →</option>
        <option value="currency">Currency</option>
        <option value="sign">Sign</option>
        <option value="flag">Flag</option>
      </select>
      {cfg.kind === 'account_child' && (
        <input
          type="text"
          value={cfg.account_scope ?? ''}
          onChange={(e) => onChange({ ...cfg, account_scope: e.target.value })}
          placeholder="scope (blank = top-level)"
          className="w-[200px] rounded-[6px] border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-teal-500"
        />
      )}
    </div>
  )
}

function GridCanvas({
  rows,
  controls,
  onNarrow,
}: {
  rows: PostingSearchRow[]
  controls: GridControls
  onNarrow: (patch: DraftPatch) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  // Track container size.
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect
      setSize({ w: Math.floor(cr.width), h: Math.floor(cr.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const grid = useMemo(() => buildGrid(rows, controls.x, controls.y), [rows, controls.x, controls.y])

  // Per-cell layout: top-left + width/height for hit-testing + draw.
  const layout = useMemo(() => {
    if (size.w === 0 || size.h === 0) return null
    const nx = Math.max(1, grid.xBins.length)
    const ny = Math.max(1, grid.yBins.length)
    const plotW = size.w - LEFT_GUTTER
    const plotH = size.h - HEADER_HEIGHT
    const cellW = plotW / nx
    const cellH = plotH / ny
    return { cellW, cellH, plotW, plotH, originX: LEFT_GUTTER, originY: HEADER_HEIGHT }
  }, [size, grid])

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !layout) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(size.w * dpr)
    canvas.height = Math.floor(size.h * dpr)
    canvas.style.width = `${size.w}px`
    canvas.style.height = `${size.h}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    drawAxes(ctx, grid, layout, size)
    drawDots(ctx, rows, grid, layout)
  }, [rows, grid, layout, size])

  // Click → narrow.
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!layout) return
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    if (mx < layout.originX || my < layout.originY) return
    const xi = Math.floor((mx - layout.originX) / layout.cellW)
    const yi = Math.floor((my - layout.originY) / layout.cellH)
    if (xi < 0 || xi >= grid.xBins.length) return
    if (yi < 0 || yi >= grid.yBins.length) return
    const xPatch = cellNarrow(controls.x, grid.xBins[xi].key)
    const yPatch = cellNarrow(controls.y, grid.yBins[yi].key)
    const patch: DraftPatch = { ...(xPatch ?? {}), ...(yPatch ?? {}) }
    if (Object.keys(patch).length > 0) onNarrow(patch)
  }

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden">
      <canvas
        ref={canvasRef}
        onClick={onClick}
        className="cursor-pointer"
        title="Click a cell to narrow filters"
      />
    </div>
  )
}

function drawAxes(
  ctx: CanvasRenderingContext2D,
  grid: ReturnType<typeof buildGrid>,
  layout: { cellW: number; cellH: number; originX: number; originY: number; plotH: number; plotW: number },
  size: { w: number; h: number },
) {
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = AXIS
  ctx.strokeStyle = GRID
  ctx.lineWidth = 1

  // X labels along top.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < grid.xBins.length; i++) {
    const x = layout.originX + i * layout.cellW + layout.cellW / 2
    ctx.fillText(truncate(grid.xBins[i].label, Math.max(4, Math.floor(layout.cellW / 7))), x, HEADER_HEIGHT / 2)
  }

  // Y labels along left.
  ctx.textAlign = 'right'
  for (let i = 0; i < grid.yBins.length; i++) {
    const y = layout.originY + i * layout.cellH + layout.cellH / 2
    ctx.fillText(truncate(grid.yBins[i].label, Math.floor((LEFT_GUTTER - 12) / 6)), LEFT_GUTTER - 8, y)
  }

  // Grid lines.
  ctx.beginPath()
  for (let i = 0; i <= grid.xBins.length; i++) {
    const x = layout.originX + i * layout.cellW
    ctx.moveTo(x, layout.originY)
    ctx.lineTo(x, size.h)
  }
  for (let i = 0; i <= grid.yBins.length; i++) {
    const y = layout.originY + i * layout.cellH
    ctx.moveTo(layout.originX, y)
    ctx.lineTo(size.w, y)
  }
  ctx.stroke()
}

function drawDots(
  ctx: CanvasRenderingContext2D,
  rows: PostingSearchRow[],
  grid: ReturnType<typeof buildGrid>,
  layout: { cellW: number; cellH: number; originX: number; originY: number },
) {
  for (let yi = 0; yi < grid.yBins.length; yi++) {
    for (let xi = 0; xi < grid.xBins.length; xi++) {
      const ids = grid.cells[yi][xi]
      if (ids.length === 0) continue
      const cx = layout.originX + xi * layout.cellW
      const cy = layout.originY + yi * layout.cellH
      packDots(ctx, rows, ids, cx, cy, layout.cellW, layout.cellH)
    }
  }
}

function packDots(
  ctx: CanvasRenderingContext2D,
  rows: PostingSearchRow[],
  ids: number[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const n = ids.length
  const cols = Math.ceil(Math.sqrt(n * (w / h)))
  const rowsN = Math.ceil(n / cols)
  const sx = w / cols
  const sy = h / rowsN
  const r = Math.max(0.8, Math.min(sx, sy) / 2 - 0.5)
  for (let i = 0; i < n; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const cx = x + col * sx + sx / 2
    const cy = y + row * sy + sy / 2
    const posting = rows[ids[i]]
    ctx.fillStyle = posting.amount.startsWith('-') ? DEBIT : CREDIT
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function truncate(s: string, max: number): string {
  if (max <= 1) return ''
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}
