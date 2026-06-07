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
import { Check, ChevronsUpDown, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { PointsPathsResult, PathNode, PathEdge } from '@/durable/agents/tools/concierge/points-paths'
import type { LoyaltyCurrency } from '@/durable/agents/tools/concierge/loyalty-currencies'

export type PointsStatus = 'idle' | 'loading' | 'ready' | 'error'
export type FilterMode = 'include' | 'exclude'

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const fmtK = (n: number) =>
  n >= 1000 ? `${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : String(Math.round(n))

const W = 196
const H = 64
const ACTIVE_TAB = 'aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:shadow-sm'

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
    <div className={cn('flex h-[64px] w-[196px] flex-col justify-center rounded-md border bg-white px-3 shadow-sm', data.held ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-slate-200')}>
      <div className="truncate text-xs font-semibold text-slate-800">{data.display}</div>
      <div className="flex items-center justify-between">
        <span className="truncate text-[10px] text-muted-foreground">{data.issuer ?? 'card'}</span>
        <NeedLine data={data} />
      </div>
      <HeldLine data={data} />
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-slate-300" />
    </div>
  )
}
function CurrencyNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={cn('flex h-[64px] w-[196px] flex-col justify-center rounded-md border bg-sky-50/60 px-3 shadow-sm', data.held ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-sky-200')}>
      <div className="truncate text-xs font-medium text-slate-800">{data.display}</div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-sky-700">{data.multiplier != null ? `×${data.multiplier.toFixed(2)}` : '—'}</span>
        <NeedLine data={data} />
      </div>
      <HeldLine data={data} />
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-sky-300" />
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-sky-300" />
    </div>
  )
}
function TargetNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={cn('flex h-[64px] w-[196px] flex-col justify-center rounded-md border bg-slate-900 px-3 text-white shadow', data.held ? 'border-emerald-400 ring-1 ring-emerald-300' : 'border-slate-800')}>
      <div className="truncate text-xs font-semibold">{data.display}</div>
      <div className="text-[10px] text-slate-300">{data.amount != null ? `${fmt(data.amount)} needed` : 'target'}</div>
      <HeldLine data={data} className="text-emerald-400" />
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-slate-500" />
    </div>
  )
}
const nodeTypes = { card: CardNode, currency: CurrencyNode, target: TargetNode }

// ── filter state ────────────────────────────────────────────────────────────
export type PointsFilters = {
  maxHops: number // 1 = Direct, 2 = Via 1, 3 = Via 2
  bestOnly: boolean
  cardMode: FilterMode
  selectedCards: Set<string>
  currencyMode: FilterMode
  selectedCurrencies: Set<string>
}

function toFlow(data: PointsPathsResult, f: PointsFilters) {
  // node-level passes
  const pass = (n: PathNode): boolean => {
    if (n.kind === 'target') return true
    if (n.kind === 'currency') {
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

  const bestTransfer = new Set<string>()
  if (f.bestOnly) for (const n of data.nodes) if (n.path) for (let i = 0; i < n.path.length - 1; i++) bestTransfer.add(`${n.path[i]}->${n.path[i + 1]}`)

  const candidate = data.edges.filter((e) => {
    if (!kept.has(e.from) || !kept.has(e.to)) return false
    if (f.bestOnly && e.kind === 'transfer' && !bestTransfer.has(`${e.from}->${e.to}`)) return false
    return true
  })

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

  const rfNodes: Node<NodeData>[] = data.nodes
    .filter((n) => kept.has(n.id))
    .map((n) => ({ id: n.id, type: n.kind, position: { x: 0, y: 0 }, data: { ...n, amount: data.amount } }))
  const rfEdges: Edge[] = candidate
    .filter((e) => kept.has(e.from) && kept.has(e.to))
    .map((e: PathEdge) => ({
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      label: e.kind === 'transfer' && e.ratio_source != null ? `${e.ratio_source}:${e.ratio_dest}` : undefined,
      animated: e.kind === 'transfer',
      style: { stroke: e.kind === 'earn' ? '#cbd5e1' : '#94a3b8', strokeWidth: 1.2 },
      labelStyle: { fontSize: 9, fill: '#475569' },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.85 },
    }))
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
                <CommandItem key={c.slug} value={`${c.name} ${c.slug}`} onSelect={() => { onChange(c.slug); setOpen(false) }}>
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
        <TabsTrigger value="include" className={cn('text-xs', ACTIVE_TAB)}>Include</TabsTrigger>
        <TabsTrigger value="exclude" className={cn('text-xs', ACTIVE_TAB)}>Exclude</TabsTrigger>
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
  onMaxHops: (n: number) => void
  onBestOnly: (v: boolean) => void
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
    () => (data?.nodes ?? []).filter((n) => n.kind === 'currency').sort((a, b) => (a.multiplier ?? 99) - (b.multiplier ?? 99)),
    [data],
  )
  const filterCount = filters.selectedCards.size + filters.selectedCurrencies.size

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-white px-4 py-2.5">
        <TargetCombobox value={target} onChange={onTarget} currencies={currencies} />
        <span className="mx-1 hidden text-xs text-muted-foreground sm:inline">Within</span>
        <Tabs value={String(filters.maxHops)} onValueChange={(v) => props.onMaxHops(Number(v))}>
          <TabsList className="h-8">
            {HOP_TABS.map((t) => (
              <TabsTrigger key={t.key} value={String(t.key)} className={cn('px-2.5 text-xs', ACTIVE_TAB)}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button size="sm" variant={filters.bestOnly ? 'default' : 'outline'} className="h-8 px-2.5" onClick={() => props.onBestOnly(!filters.bestOnly)}>
          Best routes
        </Button>

        {/* filters popover */}
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5" />}>
            <SlidersHorizontal className="size-3.5" />
            <span className="hidden sm:inline">Filters</span>
            {filterCount > 0 ? <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground">{filterCount}</span> : null}
          </PopoverTrigger>
          <PopoverContent className="max-h-[70vh] w-[320px] space-y-4 overflow-y-auto p-3" align="end">
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
                        className="text-[11px] font-semibold text-slate-700 hover:underline"
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
              <h3 className="text-xs font-medium text-muted-foreground">Currencies</h3>
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
      </div>

      <div className="relative min-h-0 flex-1 bg-[#fbfbfa]">
        {status === 'loading' ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Computing paths…</div>
        ) : status === 'idle' ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Choose the points you want to reach.</div>
        ) : status === 'error' ? (
          <div className="flex h-full items-center justify-center text-sm text-red-600">{props.error ?? 'Something went wrong.'}</div>
        ) : (
          <ReactFlow nodes={flow.nodes} edges={flow.edges} nodeTypes={nodeTypes} fitView proOptions={{ hideAttribution: true }} minZoom={0.2} nodesDraggable={false} nodesConnectable={false}>
            <Background color="#e2e8f0" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
