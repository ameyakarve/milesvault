'use client'

import { useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { PlanToolbar } from '../plan-toolbar'
import type {
  AirlineExplorerResult,
  ExplorerAirline,
  Alliance,
} from '@/durable/agents/tools/concierge/airline-explorer'

type GroupKey =
  | 'star'
  | 'oneworld'
  | 'skyteam'
  | 'emirates'
  | 'etihad'
  | 'latam'
  | 'none'

const PALETTE: Record<GroupKey, { label: string; bg: string; border: string; swatch: string }> = {
  star: { label: 'Star Alliance', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.55)', swatch: '#f59e0b' },
  oneworld: { label: 'oneworld', bg: 'rgba(59,130,246,0.07)', border: 'rgba(59,130,246,0.55)', swatch: '#3b82f6' },
  skyteam: { label: 'SkyTeam', bg: 'rgba(139,92,246,0.07)', border: 'rgba(139,92,246,0.55)', swatch: '#8b5cf6' },
  emirates: { label: 'Emirates', bg: 'rgba(244,63,94,0.07)', border: 'rgba(244,63,94,0.55)', swatch: '#f43f5e' },
  etihad: { label: 'Etihad', bg: 'rgba(194,65,12,0.08)', border: 'rgba(194,65,12,0.6)', swatch: '#c2410c' },
  latam: { label: 'LATAM', bg: 'rgba(219,39,119,0.07)', border: 'rgba(219,39,119,0.55)', swatch: '#db2777' },
  none: { label: 'Unaligned', bg: 'rgba(120,120,120,0.06)', border: 'rgba(120,120,120,0.45)', swatch: '#9a9a9a' },
}
const GROUP_ORDER: GroupKey[] = ['star', 'oneworld', 'skyteam', 'emirates', 'etihad', 'latam', 'none']
const allianceKey = (a: Alliance): GroupKey => (a == null ? 'none' : a)

// Carriers that get their OWN single-airline cluster — UI grouping only (they're
// unaligned in the KG but carry so many cross-alliance partners they read best
// as standalone hubs).
const SOLO: Record<string, GroupKey> = {
  'airline/emirates': 'emirates',
  'airline/etihad-airways': 'etihad',
  'airline/latam-airlines': 'latam',
}
const groupOf = (a: ExplorerAirline): GroupKey => SOLO[a.slug] ?? allianceKey(a.alliance)

// ISO-3166 alpha-2 → flag emoji (regional indicator symbols).
const flag = (cc: string) =>
  cc.toUpperCase().replace(/[A-Z]/g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))

// Focus-picker filter. A 2-letter query is treated as an IATA code → EXACT match
// against the airline's `iata` keyword. Anything else fuzzy-matches the display
// name (subsequence). cmdk's default scorer ranks 2-letter codes poorly, so we
// split the two cases. `value` is the airline name; `keywords` carries the iata.
function airlineFilter(value: string, search: string, keywords?: string[]): number {
  const q = search.trim().toLowerCase()
  if (!q) return 1
  if (q.length === 2) return (keywords?.[0] ?? '').toLowerCase() === q ? 1 : 0
  const name = value.toLowerCase()
  let i = 0
  for (const ch of q) {
    i = name.indexOf(ch, i)
    if (i === -1) return 0
    i += 1
  }
  return 1
}

// ── geometry ────────────────────────────────────────────────────────────────
const NODE_W = 56
const NODE_H = 36
const GAP = 4
const PAD = 12
const HEADER = 26
const GGAP = 28
const UNI = 'var(--foreground)'
const BIDIR = '#14b8a6'

type Cluster = {
  key: GroupKey
  cols: number
  w: number
  h: number
  airlines: ExplorerAirline[]
}

// Group airlines into clusters and size each box (squarish grid).
function buildClusters(data: AirlineExplorerResult, hidden: Set<GroupKey>): Cluster[] {
  const byKey = new Map<GroupKey, ExplorerAirline[]>()
  for (const g of GROUP_ORDER) byKey.set(g, [])
  for (const a of data.airlines) byKey.get(groupOf(a))!.push(a)
  for (const list of byKey.values())
    list.sort((x, y) => (x.iata || x.slug).localeCompare(y.iata || y.slug))

  return GROUP_ORDER.filter((k) => byKey.get(k)!.length > 0 && !hidden.has(k)).map((key) => {
    const airlines = byKey.get(key)!
    const cols = Math.max(1, Math.ceil(Math.sqrt(airlines.length)))
    const rows = Math.max(1, Math.ceil(airlines.length / cols))
    return {
      key,
      cols,
      airlines,
      w: PAD * 2 + cols * NODE_W + (cols - 1) * GAP,
      h: HEADER + PAD + rows * NODE_H + (rows - 1) * GAP + PAD,
    }
  })
}

// Deliberate CORNERS + CENTER layout: the four alliance blocks sit in the four
// corners and the three single-airline hubs (Emirates/Etihad/LATAM) stack down
// the middle — so the alliances wrap AROUND the solo hubs rather than sitting in
// a row. Deterministic (no ELK), so it runs synchronously and fills the canvas.
const CORNER: Partial<Record<GroupKey, 'TL' | 'TR' | 'BL' | 'BR'>> = {
  star: 'TL',
  oneworld: 'TR',
  skyteam: 'BL',
  none: 'BR',
}
const CENTER_ORDER: GroupKey[] = ['emirates', 'etihad', 'latam']

function layoutClusters(clusters: Cluster[]): Record<string, { x: number; y: number }> {
  const byKey = new Map(clusters.map((c) => [c.key, c]))
  const g = (k: GroupKey) => byKey.get(k)
  const tl = g('star')
  const tr = g('oneworld')
  const bl = g('skyteam')
  const br = g('none')
  const center = CENTER_ORDER.map(g).filter(Boolean) as Cluster[]

  const leftW = Math.max(tl?.w ?? 0, bl?.w ?? 0)
  const rightW = Math.max(tr?.w ?? 0, br?.w ?? 0)
  const centerW = center.reduce((m, c) => Math.max(m, c.w), 0)
  const topH = Math.max(tl?.h ?? 0, tr?.h ?? 0)
  const botH = Math.max(bl?.h ?? 0, br?.h ?? 0)

  const centerX = leftW > 0 ? leftW + GGAP : 0
  const rightX = centerX + (centerW > 0 ? centerW + GGAP : 0)

  const cornerH = topH + (botH > 0 ? GGAP + botH : 0)
  const centerStackH =
    center.reduce((s, c) => s + c.h, 0) + Math.max(0, center.length - 1) * GGAP
  const totalH = Math.max(cornerH, centerStackH)

  const pos: Record<string, { x: number; y: number }> = {}
  if (tl) pos[tl.key] = { x: 0, y: 0 }
  if (tr) pos[tr.key] = { x: rightX, y: 0 }
  if (bl) pos[bl.key] = { x: 0, y: totalH - bl.h }
  if (br) pos[br.key] = { x: rightX, y: totalH - br.h }
  // center column, vertically centered against the corner grid
  let cy = (totalH - centerStackH) / 2
  for (const c of center) {
    pos[c.key] = { x: centerX + (centerW - c.w) / 2, y: cy }
    cy += c.h + GGAP
  }
  return pos
}

type AirlineNodeData = { airline: ExplorerAirline; focused: boolean; dimmed: boolean }
type GroupNodeData = { key: GroupKey; label: string }
type AnyData = AirlineNodeData | GroupNodeData

function buildFlow(
  data: AirlineExplorerResult,
  clusters: Cluster[],
  pos: Record<string, { x: number; y: number }>,
  focus: string | null,
): { nodes: Node<AnyData>[]; edges: Edge[] } {
  const visibleGroups = new Set(clusters.map((c) => c.key))

  // touched-by-focus set (for dimming)
  const lit = new Set<string>()
  if (focus) {
    lit.add(focus)
    for (const e of data.edges) {
      if (e.from === focus) lit.add(e.to)
      else if (e.to === focus) lit.add(e.from)
    }
  }

  const nodes: Node<AnyData>[] = []
  for (const c of clusters) {
    const p = pos[c.key] ?? { x: 0, y: 0 }
    nodes.push({
      id: `group-${c.key}`,
      type: 'allianceGroup',
      position: { x: p.x, y: p.y },
      data: { key: c.key, label: PALETTE[c.key].label },
      draggable: false,
      selectable: false,
      style: { width: c.w, height: c.h },
    })
    c.airlines.forEach((a, i) => {
      const col = i % c.cols
      const row = Math.floor(i / c.cols)
      nodes.push({
        id: a.slug,
        type: 'airline',
        parentId: `group-${c.key}`,
        extent: 'parent',
        draggable: false,
        position: { x: PAD + col * (NODE_W + GAP), y: HEADER + PAD + row * (NODE_H + GAP) },
        data: { airline: a, focused: a.slug === focus, dimmed: focus != null && !lit.has(a.slug) },
      })
    })
  }

  // Mutual (two-way) pairs once in teal w/ double arrowheads; one-way grey.
  const airlineById = new Map(data.airlines.map((a) => [a.slug, a]))
  const inGroup = (slug: string) => {
    const a = airlineById.get(slug)
    return a ? visibleGroups.has(groupOf(a)) : false
  }
  const edgeKey = new Set(data.edges.map((e) => `${e.from} ${e.to}`))
  const drawn = new Set<string>()
  const edges: Edge[] = []
  for (const e of data.edges) {
    if (!inGroup(e.from) || !inGroup(e.to)) continue
    const mutual = edgeKey.has(`${e.to} ${e.from}`)
    if (mutual) {
      const pair = [e.from, e.to].sort().join(' ')
      if (drawn.has(pair)) continue
      drawn.add(pair)
    }
    const on = focus != null && (e.from === focus || e.to === focus)
    const off = focus != null && !on
    const color = on ? 'var(--cm-accent, #4d6e60)' : mutual ? BIDIR : UNI
    edges.push({
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      animated: on,
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 6, height: 6 },
      ...(mutual ? { markerStart: { type: MarkerType.ArrowClosed, color, width: 6, height: 6 } } : {}),
      style: {
        stroke: color,
        strokeWidth: on ? 1.8 : mutual ? 1.1 : 0.7,
        opacity: off ? 0.04 : on ? 0.9 : mutual ? 0.45 : 0.12,
      },
    })
  }
  return { nodes, edges }
}

// ── node renderers ───────────────────────────────────────────────────────────
function AllianceGroupNode({ data }: NodeProps) {
  const d = data as GroupNodeData
  const pal = PALETTE[d.key]
  return (
    <div className="size-full rounded-xl" style={{ background: pal.bg, border: `1.5px solid ${pal.border}` }}>
      <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold">
        <span className="inline-block size-2 rounded-full" style={{ background: pal.swatch }} />
        {d.label}
      </div>
    </div>
  )
}

function AirlineNode({ data }: NodeProps) {
  const { airline, focused, dimmed } = data as AirlineNodeData
  const flags = airline.countries.map((c) => flag(c)).join('')
  const title =
    `${airline.name}${airline.iata ? ` · ${airline.iata}` : ''}` +
    `${airline.countries.length ? ` · ${airline.countries.join(', ')}` : ''}`
  return (
    <div
      title={title}
      className={cn(
        'flex h-full w-full flex-col items-center justify-center rounded-md border bg-card px-1 text-center transition-opacity',
        focused
          ? 'border-[var(--cm-accent,#4d6e60)] ring-2 ring-[var(--cm-accent,#4d6e60)]'
          : 'border-border',
        dimmed ? 'opacity-30 hover:opacity-100' : 'opacity-100',
      )}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1 }} />
      <span className="text-[11px] font-bold leading-none">{airline.iata || '—'}</span>
      <span className="mt-0.5 text-[11px] leading-none">{flags}</span>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1 }} />
    </div>
  )
}

const nodeTypes = { allianceGroup: AllianceGroupNode, airline: AirlineNode }

// ── main ─────────────────────────────────────────────────────────────────────
export function AirlineExplorer({
  status,
  data,
  error,
}: {
  status: 'loading' | 'ready' | 'error'
  data?: AirlineExplorerResult
  error?: string
}) {
  const [hidden, setHidden] = useState<Set<GroupKey>>(new Set())
  const [focus, setFocus] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const clusters = useMemo(() => (data ? buildClusters(data, hidden) : []), [data, hidden])

  const { nodes, edges } = useMemo(
    () => (data ? buildFlow(data, clusters, layoutClusters(clusters), focus) : { nodes: [], edges: [] }),
    [data, clusters, focus],
  )

  const toggle = (k: GroupKey) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  const focusName = focus && data ? data.airlines.find((a) => a.slug === focus)?.name : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PlanToolbar
        meta={
          data ? (
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-[2px] w-4 rounded" style={{ background: BIDIR }} />
                two-way
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-[2px] w-4 rounded"
                  style={{ background: 'var(--foreground)', opacity: 0.45 }}
                />
                one-way
              </span>
              <span>{edges.length} partnerships</span>
            </span>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-1">
          {GROUP_ORDER.map((k) => {
            const on = !hidden.has(k)
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggle(k)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                  on ? 'bg-card text-foreground' : 'bg-transparent text-muted-foreground line-through',
                )}
                style={{ borderColor: on ? PALETTE[k].border : 'var(--border)' }}
              >
                <span className="inline-block size-2 rounded-full" style={{ background: PALETTE[k].swatch }} />
                {PALETTE[k].label}
              </button>
            )
          })}
        </div>

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger
            render={<Button variant="outline" size="sm" className="ml-1 h-8 gap-1.5 text-xs" />}
          >
            {focusName ? `Focus: ${focusName}` : 'Focus an airline'}
            <ChevronsUpDown className="size-3.5 opacity-50" />
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            {/* A 2-letter query is an IATA code → exact match (the `iata`
                keyword); anything longer fuzzy-matches the display name. cmdk's
                default scorer ranks 2-letter codes poorly, so we special-case it. */}
            <Command filter={airlineFilter}>
              <CommandInput placeholder="Search airline or IATA…" className="text-sm" />
              <CommandList>
                <CommandEmpty>No airline found.</CommandEmpty>
                <CommandGroup>
                  {[...(data?.airlines ?? [])]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((a) => (
                      <CommandItem
                        key={a.slug}
                        value={a.name}
                        keywords={a.iata ? [a.iata] : undefined}
                        onSelect={() => {
                          setFocus(a.slug)
                          setPickerOpen(false)
                        }}
                        className="text-sm"
                      >
                        <Check className={cn('mr-2 size-4', focus === a.slug ? 'opacity-100' : 'opacity-0')} />
                        <span className="font-mono text-xs font-bold">{a.iata || '—'}</span>
                        <span className="ml-2 truncate">{a.name}</span>
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {focus ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() => setFocus(null)}
          >
            <X className="size-3.5" /> Clear
          </Button>
        ) : null}
      </PlanToolbar>

      <div className="relative min-h-0 flex-1">
        {status === 'loading' ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Building the map…
          </div>
        ) : status === 'error' ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">
            {error || 'Could not load the airline graph.'}
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.06 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.15}
            maxZoom={2}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            panOnDrag
            zoomOnPinch
            onNodeClick={(_, n) => {
              if (n.type === 'airline') setFocus((cur) => (cur === n.id ? null : n.id))
            }}
          >
            <Background color="var(--border)" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
