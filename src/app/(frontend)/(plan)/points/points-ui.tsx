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
const fmtK = (n: number) =>
  n >= 1000 ? `${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : String(Math.round(n))

const W = 196
const H = 64

type NodeData = PathNode & { amount: number | null }

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
function NeedLine({ data }: { data: NodeData }) {
  if (data.amount == null || data.multiplier == null) return null
  return <span className="text-[10px] text-muted-foreground">≈ {fmtK(data.amount * data.multiplier)} needed</span>
}
// Current ledger balance, shown only when the user holds this account.
function HeldLine({ data, className }: { data: NodeData; className?: string }) {
  if (!data.held) return null
  return (
    <span className={cn('truncate text-[10px] font-semibold text-emerald-600', className)}>
      Balance {fmt(data.balance ?? 0)}
      {data.balanceCurrency ? ` ${data.balanceCurrency}` : ''}
    </span>
  )
}
function CardNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={cn('flex h-[64px] w-[196px] flex-col justify-center rounded-md border bg-card px-3 shadow-sm', data.held ? 'border-emerald-400 ring-1 ring-emerald-200/60 dark:ring-emerald-800/60' : 'border-border')}>
      <div className="truncate text-xs font-semibold text-foreground">{data.display}</div>
      <div className="flex items-center justify-between">
        <span className="truncate text-[10px] text-muted-foreground">{data.issuer ?? 'card'}</span>
        <NeedLine data={data} />
      </div>
      <HeldLine data={data} />
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-muted-foreground/50" />
    </div>
  )
}
function ProgramNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={cn('flex h-[64px] w-[196px] flex-col justify-center rounded-md border bg-muted/40 px-3 shadow-sm', data.held ? 'border-emerald-400 ring-1 ring-emerald-200/60 dark:ring-emerald-800/60' : 'border-border')}>
      <div className="truncate text-xs font-medium text-foreground">{data.display}</div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{data.multiplier != null ? `×${data.multiplier.toFixed(2)}` : '—'}</span>
        <NeedLine data={data} />
      </div>
      <HeldLine data={data} />
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-foreground/40" />
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-foreground/40" />
    </div>
  )
}
function TargetNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={cn('flex h-[64px] w-[196px] flex-col justify-center rounded-md border bg-foreground px-3 text-background shadow', data.held ? 'border-emerald-400 ring-1 ring-emerald-300/60' : 'border-foreground/80')}>
      <div className="truncate text-xs font-semibold">{data.display}</div>
      <div className="text-[10px] opacity-60">{data.amount != null ? `${fmt(data.amount)} needed` : 'target'}</div>
      <HeldLine data={data} className="text-emerald-400" />
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-background/50" />
    </div>
  )
}
// Fiat source: buying points. multiplier here is CASH minor-units (cents/paise)
// per 1 target point, so we render a price, not a ×ratio. Always "owned".
function FiatNode({ data }: NodeProps<Node<NodeData>>) {
  const code = data.beancountName ?? ''
  const perK = data.multiplier != null ? `${code} ${(data.multiplier * 10).toFixed(2)}/1k` : '—'
  const total =
    data.amount != null && data.multiplier != null
      ? `≈ ${code} ${fmt((data.amount * data.multiplier) / 100)} to buy`
      : null
  return (
    <div className="flex h-[64px] w-[196px] flex-col justify-center rounded-md border border-emerald-400/60 bg-emerald-50/60 px-3 shadow-sm ring-1 ring-emerald-200/60 dark:bg-emerald-950/30 dark:border-emerald-700/60 dark:ring-emerald-800/40">
      <div className="flex items-center gap-1">
        <DollarSign className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="truncate text-xs font-semibold text-emerald-900 dark:text-emerald-200">{data.display}</div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">{perK}</span>
        {total ? <span className="truncate text-[10px] text-emerald-700 dark:text-emerald-400">{total}</span> : null}
      </div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-emerald-400/60" />
    </div>
  )
}
const nodeTypes = { card: CardNode, program: ProgramNode, target: TargetNode, fiat: FiatNode }

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
  // "My points": keep held nodes plus the currencies on their cheapest route to
  // the target, so held sources still connect through intermediate hops.
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
      if (n.kind === 'card') for (const e of data.edges) { if (e.kind === 'earn' && e.from === n.id) addChain(e.to) }
      else addChain(n.id)
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
    .map((n) => ({ id: n.id, type: n.fiat ? 'fiat' : n.kind, position: { x: 0, y: 0 }, data: { ...n, amount: data.amount } }))
  const rfEdges: Edge[] = candidate
    .filter((e) => kept.has(e.from) && kept.has(e.to))
    .map((e: PathEdge) => {
      // A sale edge is a buy: fiat → loyalty currency. ratio_source is cash in
      // minor units, so label it as a price ($X/1k) and style it distinctly.
      const sale = fiatIds.has(e.from)
      const price =
        sale && e.ratio_source != null && e.ratio_dest
          ? `$${((e.ratio_source * 10) / e.ratio_dest).toFixed(2)}/1k`
          : undefined
      return {
        id: `${e.from}->${e.to}`,
        source: e.from,
        target: e.to,
        label: sale ? price : e.kind === 'transfer' && e.ratio_source != null ? `${e.ratio_source}:${e.ratio_dest}` : undefined,
        animated: e.kind === 'transfer',
        style: { stroke: sale ? '#10b981' : e.kind === 'earn' ? 'var(--border)' : 'var(--muted-foreground)', strokeWidth: sale ? 1.6 : 1.2, strokeDasharray: sale ? '5 3' : undefined },
        labelStyle: { fontSize: 9, fill: sale ? '#047857' : 'var(--muted-foreground)' },
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
