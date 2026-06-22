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

type GroupKey = 'star' | 'oneworld' | 'skyteam' | 'none'

const PALETTE: Record<GroupKey, { label: string; bg: string; border: string; swatch: string }> = {
  star: { label: 'Star Alliance', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.55)', swatch: '#f59e0b' },
  oneworld: { label: 'oneworld', bg: 'rgba(59,130,246,0.07)', border: 'rgba(59,130,246,0.55)', swatch: '#3b82f6' },
  skyteam: { label: 'SkyTeam', bg: 'rgba(139,92,246,0.07)', border: 'rgba(139,92,246,0.55)', swatch: '#8b5cf6' },
  none: { label: 'Unaligned', bg: 'rgba(120,120,120,0.06)', border: 'rgba(120,120,120,0.45)', swatch: '#9a9a9a' },
}
const GROUP_ORDER: GroupKey[] = ['star', 'oneworld', 'skyteam', 'none']
const allianceKey = (a: Alliance): GroupKey => (a == null ? 'none' : a)

// ISO-3166 alpha-2 → flag emoji (regional indicator symbols).
const flag = (cc: string) =>
  cc
    .toUpperCase()
    .replace(/[A-Z]/g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))

// ── geometry ────────────────────────────────────────────────────────────────
const NODE_W = 62
const NODE_H = 38
const GAP = 8
const PAD = 14
const HEADER = 30
const COLS = 6
const GGAP = 32

type AirlineNodeData = { airline: ExplorerAirline; focused: boolean; dimmed: boolean }
type GroupNodeData = { key: GroupKey; label: string }
type AnyData = AirlineNodeData | GroupNodeData

function buildFlow(
  data: AirlineExplorerResult,
  hidden: Set<GroupKey>,
  focus: string | null,
): { nodes: Node<AnyData>[]; edges: Edge[] } {
  const byKey = new Map<GroupKey, ExplorerAirline[]>()
  for (const g of GROUP_ORDER) byKey.set(g, [])
  for (const a of data.airlines) byKey.get(allianceKey(a.alliance))!.push(a)
  for (const list of byKey.values()) list.sort((x, y) => (x.iata || x.slug).localeCompare(y.iata || y.slug))

  // group sizes
  const size = (key: GroupKey) => {
    const n = byKey.get(key)!.length
    const cols = Math.min(COLS, Math.max(1, Math.ceil(Math.sqrt(n))))
    const rows = Math.max(1, Math.ceil(n / cols))
    return {
      cols,
      w: PAD * 2 + cols * NODE_W + (cols - 1) * GAP,
      h: HEADER + PAD + rows * NODE_H + (rows - 1) * GAP + PAD,
    }
  }
  const S = Object.fromEntries(GROUP_ORDER.map((k) => [k, size(k)])) as Record<
    GroupKey,
    ReturnType<typeof size>
  >
  // 2×2 grid: star | oneworld / skyteam | none
  const colW = [Math.max(S.star.w, S.skyteam.w), Math.max(S.oneworld.w, S.none.w)]
  const rowH = [Math.max(S.star.h, S.oneworld.h), Math.max(S.skyteam.h, S.none.h)]
  const pos: Record<GroupKey, { x: number; y: number }> = {
    star: { x: 0, y: 0 },
    oneworld: { x: colW[0] + GGAP, y: 0 },
    skyteam: { x: 0, y: rowH[0] + GGAP },
    none: { x: colW[0] + GGAP, y: rowH[0] + GGAP },
  }

  // touched-by-focus set (for dimming)
  const litAirlines = new Set<string>()
  if (focus) {
    litAirlines.add(focus)
    for (const e of data.edges) {
      if (e.from === focus) litAirlines.add(e.to)
      else if (e.to === focus) litAirlines.add(e.from)
    }
  }

  const nodes: Node<AnyData>[] = []
  for (const key of GROUP_ORDER) {
    if (hidden.has(key)) continue
    const { w, h } = S[key]
    nodes.push({
      id: `group-${key}`,
      type: 'allianceGroup',
      position: pos[key],
      data: { key, label: PALETTE[key].label },
      draggable: false,
      selectable: false,
      style: { width: w, height: h },
    })
    byKey.get(key)!.forEach((a, i) => {
      const col = i % S[key].cols
      const row = Math.floor(i / S[key].cols)
      nodes.push({
        id: a.slug,
        type: 'airline',
        parentId: `group-${key}`,
        extent: 'parent',
        draggable: false,
        position: { x: PAD + col * (NODE_W + GAP), y: HEADER + PAD + row * (NODE_H + GAP) },
        data: { airline: a, focused: a.slug === focus, dimmed: focus != null && !litAirlines.has(a.slug) },
      })
    })
  }

  const edges: Edge[] = []
  for (const e of data.edges) {
    const fa = data.airlines.find((x) => x.slug === e.from)
    const ta = data.airlines.find((x) => x.slug === e.to)
    if (!fa || !ta) continue
    if (hidden.has(allianceKey(fa.alliance)) || hidden.has(allianceKey(ta.alliance))) continue
    const lit = focus != null && (e.from === focus || e.to === focus)
    const off = focus != null && !lit
    edges.push({
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      animated: lit,
      style: {
        stroke: lit ? 'var(--cm-accent, #4d6e60)' : 'var(--foreground)',
        strokeWidth: lit ? 1.6 : 0.7,
        opacity: off ? 0.04 : lit ? 0.85 : 0.14,
      },
      data: { programmes: e.programmes },
    })
  }
  return { nodes, edges }
}

// ── node renderers ───────────────────────────────────────────────────────────
function AllianceGroupNode({ data }: NodeProps) {
  const d = data as GroupNodeData
  const pal = PALETTE[d.key]
  return (
    <div
      className="size-full rounded-xl"
      style={{ background: pal.bg, border: `1.5px solid ${pal.border}` }}
    >
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold">
        <span className="inline-block size-2 rounded-full" style={{ background: pal.swatch }} />
        {d.label}
      </div>
    </div>
  )
}

function AirlineNode({ data }: NodeProps) {
  const { airline, focused, dimmed } = data as AirlineNodeData
  const flags = airline.countries.map((c) => flag(c)).join('')
  return (
    <div
      title={`${airline.name}${airline.iata ? ` (${airline.iata})` : ''}`}
      className={cn(
        'flex h-full w-full flex-col items-center justify-center rounded-md border bg-card px-1 text-center transition-opacity',
        focused ? 'border-[var(--cm-accent,#4d6e60)] ring-2 ring-[var(--cm-accent,#4d6e60)]' : 'border-border',
      )}
      style={{ opacity: dimmed ? 0.25 : 1 }}
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

  const { nodes, edges } = useMemo(
    () => (data ? buildFlow(data, hidden, focus) : { nodes: [], edges: [] }),
    [data, hidden, focus],
  )

  const toggle = (k: GroupKey) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  const focusName = focus && data ? data.airlines.find((a) => a.slug === focus)?.name : null
  const edgeCount = edges.length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PlanToolbar meta={data ? `${edgeCount} cross-alliance partnerships` : undefined}>
        {/* alliance show/hide */}
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

        {/* focus an airline */}
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger
            render={<Button variant="outline" size="sm" className="ml-1 h-8 gap-1.5 text-xs" />}
          >
            {focusName ? `Focus: ${focusName}` : 'Focus an airline'}
            <ChevronsUpDown className="size-3.5 opacity-50" />
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search airline…" className="text-sm" />
              <CommandList>
                <CommandEmpty>No airline found.</CommandEmpty>
                <CommandGroup>
                  {[...(data?.airlines ?? [])]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((a) => (
                      <CommandItem
                        key={a.slug}
                        value={`${a.name} ${a.iata}`}
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
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs text-muted-foreground" onClick={() => setFocus(null)}>
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
            proOptions={{ hideAttribution: true }}
            minZoom={0.15}
            maxZoom={2}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
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
