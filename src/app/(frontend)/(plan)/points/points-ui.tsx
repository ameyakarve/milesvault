'use client'

import { useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { Check, ChevronsUpDown, DollarSign, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { PlanToolbar, TAB_ACTIVE } from '../plan-toolbar'
import type { PointsPathsResult, PathNode, PathEdge } from '@/durable/agents/tools/concierge/points-paths'
import type { LoyaltyCurrency } from '@/durable/agents/tools/concierge/loyalty-currencies'

export type PointsStatus = 'idle' | 'loading' | 'ready' | 'error'
export type FilterMode = 'include' | 'exclude'

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
// Reduce a transfer ratio to lowest terms — `100:50` → `2:1`, the one number
// the graph is here to show.
const ratioLabel = (a: number, b: number) => {
  const g = gcd(a, b) || 1
  return `${a / g}:${b / g}`
}
// A parallel tier edge prefixes its ratio with the tier — the source currency's
// last segment, title-cased — so a multi-tier portal reads clearly:
// AXIS-EM-OLYMPUS → "Olympus", AXIS-EDGE-BURGUNDY → "Burgundy".
const tierLabel = (variant: string) => {
  const seg = variant.split(/[-_]/).pop() ?? variant
  return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase()
}

const W = 180
const H = 48

type NodeData = PathNode

// ── layout ────────────────────────────────────────────────────────────────
function layout(nodes: Node<NodeData>[], edges: Edge[]): Node<NodeData>[] {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 18, ranksep: 90, marginx: 16, marginy: 16 })
  g.setDefaultEdgeLabel(() => ({}))
  nodes.forEach((n) => g.setNode(n.id, { width: W, height: H }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map((n) => {
    const p = g.node(n.id)
    return { ...n, position: { x: p.x - W / 2, y: p.y - H / 2 } }
  })
}

// ── custom nodes ────────────────────────────────────────────────────────────
// Nodes carry a name and nothing else — the rates live on the edges. The one
// exception is a held balance: a fact that's genuinely the user's, not derived.
function HeldLine({ data, className }: { data: NodeData; className?: string }) {
  if (!data.held || data.balance == null) return null
  return (
    <span className={cn('truncate text-[10px] font-semibold text-emerald-600', className)}>
      {fmt(data.balance)}
      {data.balanceCurrency ? ` ${data.balanceCurrency}` : ''}
    </span>
  )
}
function CardNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={cn('flex h-[48px] w-[180px] flex-col justify-center rounded-md border bg-sky-50/80 px-3 shadow-sm dark:bg-sky-950/30', data.held ? 'border-emerald-400 ring-1 ring-emerald-200/60 dark:ring-emerald-800/60' : 'border-sky-300 dark:border-sky-800/60')}>
      <div className="truncate text-xs font-semibold text-sky-900 dark:text-sky-200">{data.display}</div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-sky-400/60" />
    </div>
  )
}
function ProgramNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={cn('flex h-[48px] w-[180px] flex-col justify-center rounded-md border bg-muted/40 px-3 shadow-sm', data.held ? 'border-emerald-400 ring-1 ring-emerald-200/60 dark:ring-emerald-800/60' : 'border-border')}>
      <div className="truncate text-xs font-medium text-foreground">{data.display}</div>
      <HeldLine data={data} />
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-foreground/40" />
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-foreground/40" />
    </div>
  )
}
function TargetNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className="flex h-[48px] w-[180px] flex-col justify-center rounded-md border border-foreground/80 bg-foreground px-3 text-background shadow">
      <div className="truncate text-xs font-semibold">{data.display}</div>
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-background/50" />
    </div>
  )
}
// Fiat source: buying points with cash. The price (cash per 1k points) rides on
// the edge like every other rate; the node is just a labelled source.
function FiatNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className="flex h-[48px] w-[180px] flex-col justify-center rounded-md border border-emerald-400/60 bg-emerald-50/60 px-3 shadow-sm ring-1 ring-emerald-200/60 dark:bg-emerald-950/30 dark:border-emerald-700/60 dark:ring-emerald-800/40">
      <div className="flex items-center gap-1">
        <DollarSign className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="truncate text-xs font-semibold text-emerald-900 dark:text-emerald-200">{data.display}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-emerald-400/60" />
    </div>
  )
}
const nodeTypes = { card: CardNode, program: ProgramNode, target: TargetNode, fiat: FiatNode }

// Parallel edges between the SAME two nodes (a multi-tier portal — e.g. Axis
// TravelEdge, where Magnus / Atlas / Olympus each transfer at a different ratio)
// would otherwise stack into one line. The fan edge bows each sibling by a
// perpendicular offset keyed on its index, so every tier's ratio stays legible.
function FanEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style, data }: EdgeProps) {
  const d = (data ?? {}) as { idx?: number; count?: number; label?: string; color?: string }
  const idx = d.idx ?? 0
  const count = d.count ?? 1
  const mx = (sourceX + targetX) / 2
  const my = (sourceY + targetY) / 2
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const len = Math.hypot(dx, dy) || 1
  const off = (idx - (count - 1) / 2) * 26
  const cx = mx + (-dy / len) * off
  const cy = my + (dx / len) * off
  const path = `M${sourceX},${sourceY} Q${cx},${cy} ${targetX},${targetY}`
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {d.label ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded px-1"
            style={{
              transform: `translate(-50%, -50%) translate(${cx}px, ${cy}px)`,
              fontSize: 9,
              color: d.color,
              background: 'var(--card)',
            }}
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
const edgeTypes = { fan: FanEdge }

// ── filter state ────────────────────────────────────────────────────────────
export type PointsFilters = {
  mineOnly: boolean // "My points": restrict to accounts the user holds
  maxHops: number // 1 = Direct, 2 = Via 1, 3 = Via 2
  cardMode: FilterMode
  selectedCards: Set<string>
  currencyMode: FilterMode
  selectedCurrencies: Set<string>
}

function toFlow(data: PointsPathsResult, f: PointsFilters) {
  // "My points": keep held nodes plus the programmes on their route to the
  // target. A node's `path` is its OWN currency-route (for a card, the route its
  // earned currency actually takes — which can differ from the programme it earns
  // into), so following it keeps every real intermediate hop (e.g. KrisFlyer on
  // BizBlack → SmartBuy → KrisFlyer → Accor) instead of collapsing to a shorter
  // route the held currency can't actually use.
  let mineKeep: Set<string> | null = null
  if (f.mineOnly) {
    mineKeep = new Set<string>([data.target.slug])
    const pathOf = new Map(data.nodes.map((n) => [n.id, n.path ?? []]))
    const addChain = (slug: string) => {
      mineKeep!.add(slug)
      for (const s of pathOf.get(slug) ?? []) mineKeep!.add(s)
    }
    for (const n of data.nodes) {
      if (!n.held) continue
      mineKeep.add(n.id)
      if (n.kind === 'card') {
        // the card's own path traces its currency-route to the target
        for (const s of n.path ?? []) mineKeep.add(s)
        // fallback for cards without a resolved path: keep the programme it earns into
        if (!n.path?.length) for (const e of data.edges) { if (e.kind === 'earn' && e.from === n.id) addChain(e.to) }
      } else addChain(n.id)
    }
  }

  // node-level passes
  const pass = (n: PathNode): boolean => {
    if (n.kind === 'target') return true
    if (mineKeep && !mineKeep.has(n.id)) return false
    if (n.kind === 'program') {
      if ((n.hops ?? 0) > f.maxHops) return false
      if (f.selectedCurrencies.size) {
        const sel = f.selectedCurrencies.has(n.id)
        return f.currencyMode === 'include' ? sel : !sel
      }
      return true
    }
    // card
    if (f.selectedCards.size) {
      const sel = f.selectedCards.has(n.id)
      return f.cardMode === 'include' ? sel : !sel
    }
    return true
  }
  let kept = new Set(data.nodes.filter(pass).map((n) => n.id))

  const candidate = data.edges.filter((e) => kept.has(e.from) && kept.has(e.to))

  // reachability prune: keep only nodes that can still reach the target
  const back = new Map<string, string[]>()
  for (const e of candidate) (back.get(e.to) ?? back.set(e.to, []).get(e.to)!).push(e.from)
  const reach = new Set<string>([data.target.slug])
  const stack = [data.target.slug]
  while (stack.length) {
    const cur = stack.pop()!
    for (const from of back.get(cur) ?? []) {
      if (!reach.has(from)) {
        reach.add(from)
        stack.push(from)
      }
    }
  }
  kept = new Set([...kept].filter((id) => reach.has(id)))

  // Fiat sources get their own node type + their outgoing edges are "sales".
  const fiatIds = new Set(data.nodes.filter((n) => n.fiat).map((n) => n.id))
  const rfNodes: Node<NodeData>[] = data.nodes
    .filter((n) => kept.has(n.id))
    .map((n) => ({ id: n.id, type: n.fiat ? 'fiat' : n.kind, position: { x: 0, y: 0 }, data: { ...n } }))
  // Count siblings per node-pair: a multi-tier portal emits SEVERAL edges between
  // the same two programmes (one per tier currency, each its own ratio). Those
  // must fan out + be tier-tagged rather than collapse onto one line.
  const visibleEdges = candidate.filter((e) => kept.has(e.from) && kept.has(e.to))
  const pairCount = new Map<string, number>()
  for (const e of visibleEdges) {
    const k = `${e.from}->${e.to}`
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1)
  }
  const pairIdx = new Map<string, number>()
  const rfEdges: Edge[] = visibleEdges.map((e: PathEdge) => {
    // A sale edge is a buy: fiat → loyalty currency. ratio_source is cash in
    // minor units, so label it as a price ($X/1k) and style it distinctly.
    const sale = fiatIds.has(e.from)
    const price =
      sale && e.ratio_source != null && e.ratio_dest
        ? `$${((e.ratio_source * 10) / e.ratio_dest).toFixed(2)}/1k`
        : undefined
    // Transfer edges: ratio, with the transfer time appended when known
    // (e.g. "2:1 · 2-3 days"). The time is a per-edge KG attribute.
    const ratio =
      e.kind === 'transfer' && e.ratio_source != null && e.ratio_dest != null
        ? ratioLabel(e.ratio_source, e.ratio_dest)
        : undefined
    let transferLabel = ratio && e.transfer_time ? `${ratio} · ${e.transfer_time}` : ratio
    const pk = `${e.from}->${e.to}`
    const count = pairCount.get(pk) ?? 1
    const idx = pairIdx.get(pk) ?? 0
    pairIdx.set(pk, idx + 1)
    // Parallel tiers: tag each ratio with its tier so you can tell which card's
    // currency earns which rate (e.g. "Burgundy 2.5:1" vs "Olympus 1:4").
    if (count > 1 && e.variant && transferLabel) transferLabel = `${tierLabel(e.variant)} ${transferLabel}`
    const label = sale ? price : transferLabel
    const color = sale ? '#047857' : 'var(--muted-foreground)'
    return {
      // variant (or index) in the id keeps parallel tier edges DISTINCT — without
      // it they share one id and React Flow renders just one, hiding the rest.
      id: `${e.from}->${e.to}#${e.variant ?? idx}`,
      source: e.from,
      target: e.to,
      // count>1 → custom fan edge (renders its own label from data); otherwise
      // the default edge with its built-in label (unchanged behaviour).
      type: count > 1 ? 'fan' : undefined,
      label: count > 1 ? undefined : label,
      data: { idx, count, label, color },
      animated: e.kind === 'transfer',
      style: { stroke: sale ? '#10b981' : e.kind === 'earn' ? 'var(--border)' : 'var(--muted-foreground)', strokeWidth: sale ? 1.6 : 1.2, strokeDasharray: sale ? '5 3' : undefined },
      labelStyle: { fontSize: 9, fill: color },
      labelBgStyle: { fill: 'var(--card)', fillOpacity: 0.9 },
    }
  })
  return { nodes: layout(rfNodes, rfEdges), edges: rfEdges }
}

// ── target combobox ─────────────────────────────────────────────────────────
function TargetCombobox({ value, onChange, currencies }: { value: string; onChange: (slug: string) => void; currencies: LoyaltyCurrency[] }) {
  const [open, setOpen] = useState(false)
  const label = currencies.find((c) => c.slug === value)?.name ?? (value ? value.replace(/^[a-z]+\//, '') : 'Choose target points…')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="w-64 justify-between font-normal" />}>
        <span className="truncate">{label}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search points — Qantas, Avios, KrisFlyer…" />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {currencies.map((c) => (
                <CommandItem
                  key={c.slug}
                  value={`${c.name} ${c.slug} ${(c.aliases ?? []).join(' ')}`}
                  onSelect={() => {
                    onChange(c.slug)
                    setOpen(false)
                  }}
                >
                  <Check className={cn('size-4', value === c.slug ? 'opacity-100' : 'opacity-0')} />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ModeTabs({ mode, onMode }: { mode: FilterMode; onMode: (m: FilterMode) => void }) {
  return (
    <Tabs value={mode} onValueChange={(v) => onMode(v as FilterMode)}>
      <TabsList className="h-7 w-full">
        <TabsTrigger value="include" className={cn('text-xs', TAB_ACTIVE)}>Include</TabsTrigger>
        <TabsTrigger value="exclude" className={cn('text-xs', TAB_ACTIVE)}>Exclude</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" size="sm" variant={on ? 'default' : 'outline'} onClick={onClick} className={cn('h-7 px-2 text-xs', !on && 'text-muted-foreground')}>
      {children}
    </Button>
  )
}

// ── top-level component ─────────────────────────────────────────────────────
export type PointsProps = {
  target: string
  onTarget: (slug: string) => void
  currencies: LoyaltyCurrency[]
  status: PointsStatus
  data?: PointsPathsResult
  error?: string
  filters: PointsFilters
  onMineOnly: (v: boolean) => void
  onMaxHops: (n: number) => void
  onCardMode: (m: FilterMode) => void
  onToggleCard: (slug: string) => void
  onToggleBank: (slugs: string[]) => void
  onCurrencyMode: (m: FilterMode) => void
  onToggleCurrency: (slug: string) => void
}

const HOP_TABS = [
  { key: 1, label: 'Direct' },
  { key: 2, label: 'Via 1' },
  { key: 3, label: 'Via 2' },
]

export function Points(props: PointsProps) {
  const { target, onTarget, currencies, status, data, filters } = props
  const flow = useMemo(() => (data ? toFlow(data, filters) : { nodes: [], edges: [] }), [data, filters])

  // filter options from the result graph
  const banks = useMemo(() => {
    const cards = (data?.nodes ?? []).filter((n) => n.kind === 'card')
    const by = new Map<string, { issuer: string; cards: PathNode[] }>()
    for (const c of cards) {
      const k = c.issuer ?? '—'
      ;(by.get(k) ?? by.set(k, { issuer: k, cards: [] }).get(k)!).cards.push(c)
    }
    return [...by.values()].sort((a, b) => a.issuer.localeCompare(b.issuer))
  }, [data])
  const curOptions = useMemo(
    () => (data?.nodes ?? []).filter((n) => n.kind === 'program' && !n.fiat).sort((a, b) => (a.multiplier ?? 99) - (b.multiplier ?? 99)),
    [data],
  )
  const filterCount = filters.selectedCards.size + filters.selectedCurrencies.size

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PlanToolbar>
        <TargetCombobox value={target} onChange={onTarget} currencies={currencies} />
        <Tabs value={filters.mineOnly ? 'mine' : 'all'} onValueChange={(v) => props.onMineOnly(v === 'mine')}>
          <TabsList className="h-8">
            <TabsTrigger value="mine" className={cn('px-2.5 text-xs', TAB_ACTIVE)}>My points</TabsTrigger>
            <TabsTrigger value="all" className={cn('px-2.5 text-xs', TAB_ACTIVE)}>All points</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* filters popover */}
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5" />}>
            <SlidersHorizontal className="size-3.5" />
            <span className="hidden sm:inline">Filters</span>
            {filterCount > 0 ? <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground">{filterCount}</span> : null}
          </PopoverTrigger>
          <PopoverContent className="max-h-[70vh] w-[320px] space-y-4 overflow-y-auto p-3" align="end">
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">Routes</h3>
              <Tabs value={String(filters.maxHops)} onValueChange={(v) => props.onMaxHops(Number(v))}>
                <TabsList className="h-8 w-full">
                  {HOP_TABS.map((t) => (
                    <TabsTrigger key={t.key} value={String(t.key)} className={cn('flex-1 text-xs', TAB_ACTIVE)}>
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">Cards</h3>
              <ModeTabs mode={filters.cardMode} onMode={props.onCardMode} />
              {banks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No cards in these paths.</p>
              ) : (
                banks.map((b) => {
                  const slugs = b.cards.map((c) => c.id)
                  const sel = slugs.filter((s) => filters.selectedCards.has(s)).length
                  return (
                    <div key={b.issuer} className="space-y-1">
                      <button
                        type="button"
                        onClick={() => props.onToggleBank(slugs)}
                        className="text-[11px] font-semibold text-foreground hover:underline"
                      >
                        {b.issuer} {sel ? `(${sel}/${slugs.length})` : ''}
                      </button>
                      <div className="flex flex-wrap gap-1">
                        {b.cards.map((c) => (
                          <Chip key={c.id} on={filters.selectedCards.has(c.id)} onClick={() => props.onToggleCard(c.id)}>
                            {c.display}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">Programmes</h3>
              <ModeTabs mode={filters.currencyMode} onMode={props.onCurrencyMode} />
              <div className="flex flex-wrap gap-1">
                {curOptions.map((c) => (
                  <Chip key={c.id} on={filters.selectedCurrencies.has(c.id)} onClick={() => props.onToggleCurrency(c.id)}>
                    {c.display}
                  </Chip>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {data ? <span className="ml-auto text-xs text-muted-foreground">{flow.nodes.length} nodes · {flow.edges.length} routes</span> : null}
      </PlanToolbar>

      <div className="relative min-h-0 flex-1 bg-background">
        {status === 'loading' ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Computing paths…</div>
        ) : status === 'idle' ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Choose the points you want to reach.</div>
        ) : status === 'error' ? (
          <div className="flex h-full items-center justify-center text-sm text-destructive">{props.error ?? 'Something went wrong.'}</div>
        ) : (
          <ReactFlow
            nodes={flow.nodes}
            edges={flow.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            minZoom={0.2}
            nodesDraggable={false}
            nodesConnectable={false}
            // Fully non-interactive nodes so a one-finger drag that lands on a
            // node still pans the pane (on mobile the fit graph covers the
            // screen with nodes, leaving almost no empty pane to grab).
            elementsSelectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            panOnDrag
            zoomOnPinch
          >
            <Background color="var(--border)" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
