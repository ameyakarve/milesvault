'use client'

import { useMemo } from 'react'
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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PointsPathsResult, PathNode, PathEdge } from '@/durable/agents/tools/concierge/points-paths'

export type PointsStatus = 'idle' | 'loading' | 'ready' | 'error'

// ---- helpers -------------------------------------------------------------

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const fmtK = (n: number) =>
  n >= 1000 ? `${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : String(Math.round(n))

// node box sizes fed to the layout engine
const W = 196
const H = 56

type NodeData = PathNode & { amount: number | null }

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

// ---- custom nodes --------------------------------------------------------

function NeedLine({ data }: { data: NodeData }) {
  if (data.amount == null || data.multiplier == null) return null
  return (
    <span className="text-[10px] text-muted-foreground">
      ≈ {fmtK(data.amount * data.multiplier)} needed
    </span>
  )
}

function CardNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div
      className={cn(
        'flex h-[56px] w-[196px] flex-col justify-center rounded-md border bg-white px-3 shadow-sm',
        data.held ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-slate-200',
      )}
    >
      <div className="truncate text-xs font-semibold text-slate-800">{data.display}</div>
      <div className="flex items-center justify-between">
        <span className="truncate text-[10px] text-muted-foreground">{data.issuer ?? 'card'}</span>
        <NeedLine data={data} />
      </div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-slate-300" />
    </div>
  )
}

function CurrencyNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className="flex h-[56px] w-[196px] flex-col justify-center rounded-md border border-sky-200 bg-sky-50/60 px-3 shadow-sm">
      <div className="truncate text-xs font-medium text-slate-800">{data.display}</div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-sky-700">
          {data.multiplier != null ? `×${data.multiplier.toFixed(2)}` : '—'}
        </span>
        <NeedLine data={data} />
      </div>
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-sky-300" />
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-sky-300" />
    </div>
  )
}

function TargetNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className="flex h-[56px] w-[196px] flex-col justify-center rounded-md border border-slate-800 bg-slate-900 px-3 text-white shadow">
      <div className="truncate text-xs font-semibold">{data.display}</div>
      <div className="text-[10px] text-slate-300">
        {data.amount != null ? `${fmt(data.amount)} needed` : 'target'}
      </div>
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-slate-500" />
    </div>
  )
}

const nodeTypes = { card: CardNode, currency: CurrencyNode, target: TargetNode }

// ---- graph ---------------------------------------------------------------

function toFlow(
  data: PointsPathsResult,
  opts: { maxHops: number; showCards: boolean; bestOnly: boolean },
) {
  const keepCurrency = (n: PathNode) =>
    n.kind === 'target' || (n.hops ?? 0) <= opts.maxHops
  const keptIds = new Set(
    data.nodes
      .filter((n) =>
        n.kind === 'card'
          ? opts.showCards
          : keepCurrency(n),
      )
      .map((n) => n.id),
  )
  // "Best routes only": the union of every source's CHEAPEST path edges — turns
  // the full subgraph into a clean convergent tree.
  const bestTransfer = new Set<string>()
  if (opts.bestOnly) {
    for (const n of data.nodes) {
      if (!n.path) continue
      for (let i = 0; i < n.path.length - 1; i++) bestTransfer.add(`${n.path[i]}->${n.path[i + 1]}`)
    }
  }
  // a card survives only if the currency it earns is still in the graph
  const earnTo = new Map<string, string[]>()
  for (const e of data.edges) if (e.kind === 'earn') (earnTo.get(e.from) ?? earnTo.set(e.from, []).get(e.from)!).push(e.to)
  for (const n of data.nodes)
    if (n.kind === 'card' && keptIds.has(n.id) && !(earnTo.get(n.id) ?? []).some((c) => keptIds.has(c)))
      keptIds.delete(n.id)

  const rfNodes: Node<NodeData>[] = data.nodes
    .filter((n) => keptIds.has(n.id))
    .map((n) => ({ id: n.id, type: n.kind, position: { x: 0, y: 0 }, data: { ...n, amount: data.amount } }))
  const rfEdges: Edge[] = data.edges
    .filter((e) => {
      if (!keptIds.has(e.from) || !keptIds.has(e.to)) return false
      if (opts.bestOnly && e.kind === 'transfer' && !bestTransfer.has(`${e.from}->${e.to}`)) return false
      return true
    })
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

// ---- top-level component -------------------------------------------------

export type PointsProps = {
  target: string
  onTarget: (v: string) => void
  status: PointsStatus
  data?: PointsPathsResult
  error?: string
  maxHops: number
  onMaxHops: (n: number) => void
  showCards: boolean
  onShowCards: (v: boolean) => void
  bestOnly: boolean
  onBestOnly: (v: boolean) => void
}

export function Points(props: PointsProps) {
  const { target, onTarget, status, data, maxHops, showCards, bestOnly } = props
  const flow = useMemo(
    () => (data ? toFlow(data, { maxHops, showCards, bestOnly }) : { nodes: [], edges: [] }),
    [data, maxHops, showCards, bestOnly],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-white px-4 py-2.5">
        <Input
          value={target}
          onChange={(e) => onTarget(e.target.value)}
          placeholder="Target points — e.g. Qantas Points, Avios"
          className="h-9 w-64"
        />
        <span className="mx-1 text-xs text-muted-foreground">Within</span>
        {[1, 2, 3].map((h) => (
          <Button
            key={h}
            size="sm"
            variant={maxHops === h ? 'default' : 'outline'}
            className="h-8 px-2.5"
            onClick={() => props.onMaxHops(h)}
          >
            {h} hop{h > 1 ? 's' : ''}
          </Button>
        ))}
        <Button
          size="sm"
          variant={bestOnly ? 'default' : 'outline'}
          className="h-8 px-2.5"
          onClick={() => props.onBestOnly(!bestOnly)}
        >
          Best routes
        </Button>
        <Button
          size="sm"
          variant={showCards ? 'default' : 'outline'}
          className="h-8 px-2.5"
          onClick={() => props.onShowCards(!showCards)}
        >
          Cards
        </Button>
        {data ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {flow.nodes.length} nodes · {flow.edges.length} routes
          </span>
        ) : null}
      </div>

      {/* graph */}
      <div className="relative min-h-0 flex-1 bg-[#fbfbfa]">
        {status === 'loading' ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Computing paths…
          </div>
        ) : status === 'idle' ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Enter the points you want to reach.
          </div>
        ) : status === 'error' ? (
          <div className="flex h-full items-center justify-center text-sm text-red-600">
            {props.error ?? 'Something went wrong.'}
          </div>
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
          >
            <Background color="#e2e8f0" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
