'use client'

import { useEffect, useMemo, useState } from 'react'
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
import { Check, ChevronsUpDown, DollarSign, Eye, EyeOff, MousePointerClick, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { matchesTokens } from '@/lib/search-match'
import { PlanToolbar, TAB_ACTIVE } from '../plan-toolbar'
import type { PointsPathsResult, PathNode, PathEdge } from '@/durable/agents/tools/concierge/points-paths'
import type { LoyaltyCurrency } from '@/durable/agents/tools/concierge/loyalty-currencies'

export type PointsStatus = 'idle' | 'loading' | 'ready' | 'error'

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
// A small, medium-tone palette (readable on light AND dark) so transfer edges —
// and their ratio labels — are distinguishable. Deterministic by edge key so a
// given edge keeps its colour across renders.
const EDGE_PALETTE = ['#4d6e60', '#3b82f6', '#f59e0b', '#8b5cf6', '#f43f5e', '#0ea5a4', '#db2777', '#65a30d']
const edgeColor = (key: string) => {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return EDGE_PALETTE[Math.abs(h) % EDGE_PALETTE.length]
}

const W = 180
const H = 48

// `dir` rides on the anchor/target node so it knows which side to put its handle:
// in 'to' mode the target RECEIVES (left handle); in 'from' mode the anchor SENDS
// (right handle), since it sits leftmost as the source.
// `poolId` marks a shared-currency pool member (Avios) — the focus walk uses it
// to treat all members as one (1:1), since their intra edges are hidden.
type NodeData = PathNode & { dir?: 'to' | 'from'; poolId?: string; onHide?: () => void }

// Hover-revealed control on a card/programme node: drops it from the graph. Sits
// at the node's top-right corner; stopPropagation keeps the click off the node's
// focus handler. Injected per-node (bound to its id) by the top-level component.
function NodeHideButton({ onHide }: { onHide?: () => void }) {
  if (!onHide) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onHide()
      }}
      title="Hide from graph"
      aria-label="Hide from graph"
      className="absolute -right-2.5 -top-2.5 z-10 flex rounded-full border border-border bg-card p-1.5 text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
    >
      <EyeOff className="size-4" />
    </button>
  )
}

// ── layout ────────────────────────────────────────────────────────────────
// `targetId`, when given, is pinned to the far right after layout — the
// destination must ALWAYS read as the rightmost (highest-rank) node, even when
// cycles among intermediates (e.g. the Avios hub) would otherwise let dagre
// rank it mid-graph.
function layout(
  nodes: Node<NodeData>[],
  edges: Edge[],
  targetId?: string,
  size?: (id: string) => { w: number; h: number },
): Node<NodeData>[] {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 18, ranksep: 90, marginx: 16, marginy: 16 })
  g.setDefaultEdgeLabel(() => ({}))
  nodes.forEach((n) => {
    const s = size?.(n.id) ?? { w: W, h: H }
    g.setNode(n.id, { width: s.w, height: s.h })
  })
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)
  const positioned = nodes.map((n) => {
    const p = g.node(n.id)
    const s = size?.(n.id) ?? { w: W, h: H }
    return { ...n, position: { x: p.x - s.w / 2, y: p.y - s.h / 2 } }
  })
  const t = targetId ? positioned.find((n) => n.id === targetId) : undefined
  const others = t ? positioned.filter((n) => n.id !== targetId) : []
  if (t && others.length) {
    const maxX = Math.max(...others.map((n) => n.position.x))
    if (t.position.x <= maxX) t.position.x = maxX + W + 60 // pin rightmost
  }
  return positioned
}

// Lay out a node set with shared-currency POOLS collapsed into labelled boxes.
// Members carry `data.poolId` (= `pool:<CURRENCY>`); any pool with ≥2 members
// present here renders as one box. `pairs` are source→target ids used ONLY for
// dagre positioning (the real, styled edges are built separately). Used for both
// the full graph and the focused/isolated route, so the box shows in both.
function clusteredLayout(
  place: Node<NodeData>[],
  pairs: Array<{ source: string; target: string }>,
  forward: boolean,
  targetSlug: string,
): Node<NodeData>[] {
  const ROW = 54 // vertical pitch per member (node is 48px + gap)
  const HEADER = 22 // room for the pool label
  const PADX = 8
  const PADY = 8
  const poolHeight = (m: number) => HEADER + m * ROW + PADY
  const byPool = new Map<string, Node<NodeData>[]>()
  for (const n of place) {
    const pid = n.data.poolId
    if (pid) (byPool.get(pid) ?? byPool.set(pid, []).get(pid)!).push(n)
  }
  const pools = new Map<string, Node<NodeData>[]>()
  const memberToPool = new Map<string, string>()
  for (const [pid, members] of byPool) {
    if (members.length < 2) continue
    pools.set(pid, members)
    for (const m of members) memberToPool.set(m.id, pid)
  }
  const poolLabel = (pid: string) => tierLabel(pid.replace(/^pool:/, ''))
  // dagre input: non-pool nodes + one tall placeholder per pool.
  const layoutNodes: Node<NodeData>[] = []
  for (const n of place) if (!memberToPool.has(n.id)) layoutNodes.push({ ...n, position: { x: 0, y: 0 } })
  for (const [pid] of pools)
    layoutNodes.push({ id: pid, type: 'pool', position: { x: 0, y: 0 }, data: { id: pid, kind: 'program', display: poolLabel(pid) } as NodeData })
  const seen = new Set<string>()
  const layoutEdges: Edge[] = []
  for (const e of pairs) {
    const s = memberToPool.get(e.source) ?? e.source
    const t = memberToPool.get(e.target) ?? e.target
    if (s === t) continue
    const k = `${s}->${t}`
    if (seen.has(k)) continue
    seen.add(k)
    layoutEdges.push({ id: k, source: s, target: t })
  }
  const sizeOf = (id: string) => (pools.has(id) ? { w: W, h: poolHeight(pools.get(id)!.length) } : { w: W, h: H })
  const pinId = forward ? undefined : (memberToPool.get(targetSlug) ?? targetSlug)
  const posOf = new Map(layout(layoutNodes, layoutEdges, pinId, sizeOf).map((n) => [n.id, n.position]))
  // Expand: pool boxes FIRST (render behind), then members, then the rest.
  const out: Node<NodeData>[] = []
  for (const [pid, members] of pools) {
    const pos = posOf.get(pid) ?? { x: 0, y: 0 }
    out.push({
      id: pid,
      type: 'pool',
      position: pos,
      data: { id: pid, kind: 'program', display: poolLabel(pid) } as NodeData,
      style: { width: W + PADX * 2, height: poolHeight(members.length) },
      draggable: false,
      selectable: false,
      zIndex: 0,
    })
    members.forEach((m, i) => out.push({ ...m, position: { x: pos.x + PADX, y: pos.y + HEADER + i * ROW }, zIndex: 1 }))
  }
  for (const n of place) if (!memberToPool.has(n.id)) out.push({ ...n, position: posOf.get(n.id) ?? { x: 0, y: 0 } })
  return out
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
    <div className={cn('group relative flex h-[48px] w-[180px] cursor-pointer flex-col justify-center rounded-md border bg-sky-50/80 px-3 shadow-sm dark:bg-sky-950/30', data.held ? 'border-emerald-400 ring-1 ring-emerald-200/60 dark:ring-emerald-800/60' : 'border-sky-300 dark:border-sky-800/60')}>
      <NodeHideButton onHide={data.onHide} />
      <div className="truncate text-xs font-semibold text-sky-900 dark:text-sky-200">{data.display}</div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-sky-400/60" />
    </div>
  )
}
function ProgramNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={cn('group relative flex h-[48px] w-[180px] cursor-pointer flex-col justify-center rounded-md border bg-muted/40 px-3 shadow-sm', data.held ? 'border-emerald-400 ring-1 ring-emerald-200/60 dark:ring-emerald-800/60' : 'border-border')}>
      <NodeHideButton onHide={data.onHide} />
      <div className="truncate text-xs font-medium text-foreground">{data.display}</div>
      <HeldLine data={data} />
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-foreground/40" />
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-foreground/40" />
    </div>
  )
}
function TargetNode({ data }: NodeProps<Node<NodeData>>) {
  // Colours set inline (not via bg-foreground/text-background utilities): inside
  // a React Flow node Safari was dropping the inverted text colour, painting the
  // node black-on-black. Inline wins over React Flow's base node CSS everywhere.
  return (
    <div
      style={{ background: 'var(--foreground)', color: 'var(--background)' }}
      className="flex h-[48px] w-[180px] cursor-pointer flex-col justify-center rounded-md border border-foreground/80 px-3 shadow"
    >
      <div className="truncate text-xs font-semibold">{data.display}</div>
      {data.dir === 'from' ? (
        <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-background/50" />
      ) : (
        <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-background/50" />
      )}
    </div>
  )
}
// Fiat source: buying points with cash. The price (cash per 1k points) rides on
// the edge like every other rate; the node is just a labelled source.
function FiatNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className="flex h-[48px] w-[180px] cursor-pointer flex-col justify-center rounded-md border border-emerald-400/60 bg-emerald-50/60 px-3 shadow-sm ring-1 ring-emerald-200/60 dark:bg-emerald-950/30 dark:border-emerald-700/60 dark:ring-emerald-800/40">
      <div className="flex items-center gap-1">
        <DollarSign className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="truncate text-xs font-semibold text-emerald-900 dark:text-emerald-200">{data.display}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-emerald-400/60" />
    </div>
  )
}
// A shared-currency POOL box (e.g. Avios: BA/Finnair/Qatar/Iberia/AerClub). It's
// a labelled background container that the member nodes sit inside; the 1:1 edges
// between members are hidden (the box says they're interchangeable), while each
// member keeps its own external in/out edges. Non-interactive — clicks/pans pass
// through to the members on top.
function PoolNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className="pointer-events-none size-full rounded-lg border border-dashed border-foreground/30 bg-muted/20">
      <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {data.display}
      </div>
    </div>
  )
}
const nodeTypes = { card: CardNode, program: ProgramNode, target: TargetNode, fiat: FiatNode, pool: PoolNode }

// Parallel edges between the SAME two nodes (a multi-tier portal — e.g. Axis
// TravelEdge, where Magnus / Atlas / Olympus each transfer at a different ratio)
// would otherwise stack into one line. The fan edge bows each sibling by a
// perpendicular offset keyed on its index, so every tier's ratio stays legible.
function FanEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style, data }: EdgeProps) {
  const d = (data ?? {}) as { idx?: number; count?: number; label?: string; color?: string; show?: boolean }
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
      {d.show && d.label ? (
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
  // The single visibility model: any card/programme node id in here is hidden.
  // Driven identically by the per-node hide button and the Filters chips — the
  // target is never hideable.
  hidden: Set<string>
}

function toFlow(data: PointsPathsResult, f: PointsFilters) {
  // 'from' (book-from) fans FORWARD off a single anchor you already hold, so the
  // "My points" route-keeping (a backward-only notion) and the held-currency
  // gate don't apply, and the anchor is the LEFTMOST source rather than the
  // rightmost target.
  const forward = data.direction === 'from'
  // "My points": keep held nodes plus the programmes on their route to the
  // target. A node's `path` is its OWN currency-route (for a card, the route its
  // earned currency actually takes — which can differ from the programme it earns
  // into), so following it keeps every real intermediate hop (e.g. KrisFlyer on
  // BizBlack → SmartBuy → KrisFlyer → Accor) instead of collapsing to a shorter
  // route the held currency can't actually use.
  let mineKeep: Set<string> | null = null
  if (f.mineOnly && !forward) {
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
    if (f.hidden.has(n.id)) return false // hidden via node button or Filters chip
    if (mineKeep && !mineKeep.has(n.id)) return false
    if (n.kind === 'program' && (n.hops ?? 0) > f.maxHops) return false
    return true
  }
  let kept = new Set(data.nodes.filter(pass).map((n) => n.id))

  // "My points" currency gate: a multi-tier portal (Axis TravelEdge) exposes a
  // tier edge for EVERY tier, but you can only feed the tiers your held cards
  // actually earn. Seed the currencies you genuinely have — held cards' earned
  // currency, held programme balances, and cash buy-ins (always available) —
  // then close forward over transfers you can feed, and keep only tier edges
  // whose source currency is in that set.
  let heldCcy: Set<string> | null = null
  if (f.mineOnly && !forward) {
    heldCcy = new Set<string>()
    for (const n of data.nodes) {
      if (n.fiat) {
        for (const e of data.edges) if (e.from === n.id && e.to_currency) heldCcy.add(e.to_currency)
        continue
      }
      if (!n.held) continue
      if (n.kind === 'card') {
        for (const e of data.edges) if (e.kind === 'earn' && e.from === n.id && e.to_currency) heldCcy.add(e.to_currency)
      } else for (const t of n.heldTickers ?? []) heldCcy.add(t)
    }
    for (let changed = true; changed; ) {
      changed = false
      for (const e of data.edges) {
        if (e.kind !== 'transfer' || !e.variant || !e.to_currency) continue
        if (heldCcy.has(e.variant) && !heldCcy.has(e.to_currency)) {
          heldCcy.add(e.to_currency)
          changed = true
        }
      }
    }
  }

  const candidate = data.edges.filter((e) => {
    if (!kept.has(e.from) || !kept.has(e.to)) return false
    // My-points: drop tier edges whose source currency you can't actually hold.
    if (heldCcy && e.kind === 'transfer' && e.variant && !heldCcy.has(e.variant)) return false
    return true
  })

  // reachability prune: keep only nodes connected to the anchor. 'to' keeps
  // nodes that can still REACH the target (walk edges backward); 'from' keeps
  // nodes REACHABLE FROM the anchor (walk edges forward).
  const adj = new Map<string, string[]>()
  for (const e of candidate) {
    const [k, v] = forward ? [e.from, e.to] : [e.to, e.from]
    ;(adj.get(k) ?? adj.set(k, []).get(k)!).push(v)
  }
  const reach = new Set<string>([data.target.slug])
  const stack = [data.target.slug]
  while (stack.length) {
    const cur = stack.pop()!
    for (const nbr of adj.get(cur) ?? []) {
      if (!reach.has(nbr)) {
        reach.add(nbr)
        stack.push(nbr)
      }
    }
  }
  kept = new Set([...kept].filter((id) => reach.has(id)))

  // ── shared-currency pools ──────────────────────────────────────────────────
  // A pool = programmes mutually linked by SAME-currency 1:1 transfers (e.g. the
  // Avios mesh: BA/Finnair/Qatar/Iberia/AerClub, all AVIOS↔AVIOS 1:1). Hide the
  // intra-pool edges and wrap the members in one labelled box — but each member
  // keeps its OWN external in/out edges. The pool is a single node for LAYOUT
  // only, then expanded into the box. (Reachability already ran over the full
  // edge set above, so members stay even though their 1:1 links get hidden.)
  const isPoolEdge = (e: PathEdge) =>
    e.kind === 'transfer' && !!e.variant && !!e.to_currency &&
    e.variant === e.to_currency && e.ratio_source != null && e.ratio_source === e.ratio_dest
  const kindOf = new Map(data.nodes.map((n) => [n.id, n.kind]))
  const uf = new Map<string, string>()
  const find = (x: string): string => {
    const p = uf.get(x)
    if (p === undefined || p === x) return x
    const r = find(p)
    uf.set(x, r)
    return r
  }
  for (const id of kept) if (kindOf.get(id) === 'program' || kindOf.get(id) === 'target') uf.set(id, id)
  const ccyAt = new Map<string, string>() // node → its pool currency
  for (const e of candidate) {
    if (!isPoolEdge(e) || !uf.has(e.from) || !uf.has(e.to)) continue
    uf.set(find(e.from), find(e.to))
    ccyAt.set(e.from, e.variant!)
    ccyAt.set(e.to, e.variant!)
  }
  const compMembers = new Map<string, string[]>()
  for (const id of kept) {
    if (!uf.has(id)) continue
    const r = find(id)
    ;(compMembers.get(r) ?? compMembers.set(r, []).get(r)!).push(id)
  }
  // memberId → `pool:<CURRENCY>` for components of ≥2 (the currency labels the box).
  const memberToPool = new Map<string, string>()
  for (const [root, members] of compMembers) {
    if (members.length < 2) continue
    const ccy = ccyAt.get(root) ?? members.map((m) => ccyAt.get(m)).find(Boolean) ?? ''
    const poolId = `pool:${ccy}`
    for (const m of members) memberToPool.set(m, poolId)
  }
  const intraPool = (e: PathEdge) =>
    memberToPool.has(e.from) && memberToPool.get(e.from) === memberToPool.get(e.to)

  // Fiat sources get their own node type + their outgoing edges are "sales".
  const fiatIds = new Set(data.nodes.filter((n) => n.fiat).map((n) => n.id))
  // Count siblings per node-pair: a multi-tier portal emits SEVERAL edges between
  // the same two programmes (one per tier currency, each its own ratio). Those
  // must fan out + be tier-tagged rather than collapse onto one line. Intra-pool
  // 1:1 edges are dropped (the box conveys the relationship).
  const visibleEdges = candidate.filter((e) => kept.has(e.from) && kept.has(e.to) && !intraPool(e))
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
    // Palette colour per transfer edge (label matches). Sales stay green; earn
    // edges (no ratio) stay muted.
    const color = sale ? '#047857' : e.kind === 'earn' ? 'var(--muted-foreground)' : edgeColor(`${e.from}->${e.to}#${e.variant ?? ''}`)
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
      // kind/variant/toCur ride along so focus isolation can walk the route
      // CURRENCY-STRICT (an edge continues only on the currency you're holding).
      data: { idx, count, label, color, kind: e.kind, variant: e.variant, toCur: e.to_currency },
      animated: e.kind === 'transfer',
      style: { stroke: sale ? '#10b981' : e.kind === 'earn' ? 'var(--border)' : color, strokeWidth: sale ? 1.6 : 1.2, strokeDasharray: sale ? '5 3' : undefined },
      labelStyle: { fontSize: 9, fill: color },
      labelBgStyle: { fill: 'var(--card)', fillOpacity: 0.9 },
    }
  })
  // Place the kept nodes (members tagged with their pool) and lay them out with
  // pools collapsed into boxes — the SAME routine the focused view uses, so the
  // box shows in both the full graph and an isolated route.
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]))
  const place: Node<NodeData>[] = [...kept].flatMap((id) => {
    const n = nodeById.get(id)
    if (!n) return []
    return [{ id, type: n.fiat ? 'fiat' : n.kind, position: { x: 0, y: 0 }, data: { ...n, dir: data.direction, poolId: memberToPool.get(id) } }]
  })
  const pairs = visibleEdges.map((e) => ({ source: e.from, target: e.to }))
  return { nodes: clusteredLayout(place, pairs, forward, data.target.slug), edges: rfEdges }
}

// ── target combobox ─────────────────────────────────────────────────────────
// Programmes always; in book-from mode it ALSO searches cards (server-side
// typeahead) so the anchor you hold can be a credit card, not just a programme.
function TargetCombobox({
  value,
  onChange,
  currencies,
  allowCards,
}: {
  value: string
  onChange: (slug: string) => void
  currencies: LoyaltyCurrency[]
  allowCards?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cards, setCards] = useState<Array<{ slug: string; name: string | null }>>([])
  const [cardName, setCardName] = useState<string | null>(null) // remembered label for a chosen card

  useEffect(() => {
    if (!allowCards || query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCards([])
      return
    }
    let cancelled = false
    const h = setTimeout(() => {
      fetch(`/api/kb/cards/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ items?: Array<{ slug: string; name: string | null }> }>) : null))
        .then((d) => !cancelled && setCards(d?.items ?? []))
        .catch(() => {})
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(h)
    }
  }, [query, allowCards])

  const label = value.startsWith('cc/')
    ? (cardName ?? value.replace(/^cc\//, '').replace(/-/g, ' '))
    : (currencies.find((c) => c.slug === value)?.name ?? (value ? value.replace(/^[a-z]+\//, '') : null))
  const placeholder = allowCards ? 'Choose what you hold…' : 'Choose target points…'

  const q = query.trim()
  const progMatches = q
    ? currencies.filter((c) => matchesTokens(q, `${c.name} ${c.slug} ${(c.aliases ?? []).join(' ')}`))
    : currencies

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="w-64 justify-between font-normal" />}>
        <span className="truncate">{label ?? placeholder}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={allowCards ? 'Search a programme or card…' : 'Search points — Qantas, Avios, KrisFlyer…'}
          />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup heading={allowCards ? 'Programmes' : undefined}>
              {progMatches.map((c) => (
                <CommandItem
                  key={c.slug}
                  value={c.slug}
                  onSelect={() => {
                    onChange(c.slug)
                    setCardName(null)
                    setOpen(false)
                  }}
                >
                  <Check className={cn('size-4', value === c.slug ? 'opacity-100' : 'opacity-0')} />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
            {allowCards && cards.length ? (
              <CommandGroup heading="Cards">
                {cards.map((c) => (
                  <CommandItem
                    key={c.slug}
                    value={c.slug}
                    onSelect={() => {
                      onChange(c.slug)
                      setCardName(c.name ?? null)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn('size-4', value === c.slug ? 'opacity-100' : 'opacity-0')} />
                    {c.name ?? c.slug.replace(/^cc\//, '')}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// A card/programme toggle: `on` = currently shown on the graph. Tapping it hides
// (outline + muted + eye-off); tapping again brings it back.
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" size="sm" variant={on ? 'default' : 'outline'} onClick={onClick} className={cn('h-7 gap-1 px-2 text-xs', !on && 'text-muted-foreground')}>
      {!on ? <EyeOff className="size-3 shrink-0 opacity-70" /> : null}
      {children}
    </Button>
  )
}

// ── top-level component ─────────────────────────────────────────────────────
export type PointsProps = {
  target: string
  onTarget: (slug: string) => void
  direction: 'to' | 'from'
  onDirection: (d: 'to' | 'from') => void
  currencies: LoyaltyCurrency[]
  status: PointsStatus
  data?: PointsPathsResult
  error?: string
  filters: PointsFilters
  onMineOnly: (v: boolean) => void
  onMaxHops: (n: number) => void
  // Visibility: toggle one node, toggle a whole bank's cards, or show everything.
  onToggleHidden: (slug: string) => void
  onToggleHiddenMany: (slugs: string[]) => void
  onUnhideAll: () => void
}

const HOP_TABS = [
  { key: 1, label: 'Direct' },
  { key: 2, label: 'Via 1' },
  { key: 3, label: 'Via 2' },
]

export function Points(props: PointsProps) {
  const { target, onTarget, direction, currencies, status, data, filters } = props
  const fromMode = direction === 'from'
  const flow = useMemo(() => (data ? toFlow(data, filters) : { nodes: [], edges: [] }), [data, filters])

  // Click-to-highlight: ALL edges stay drawn (calm, label-less by default). Pick
  // a node and its edges light up in the accent colour WITH their ratio labels,
  // everything else dims. Tap the pane to clear. Layout is unaffected.
  const ACCENT = 'var(--cm-accent, #4d6e60)'
  const [focus, setFocus] = useState<string | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocus(null)
  }, [data?.target.slug])
  // If the focused node leaves the graph (hidden via its button, or filtered
  // out), drop the focus so we don't render an empty isolated route.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (focus && !flow.nodes.some((n) => n.id === focus)) setFocus(null)
  }, [flow, focus])
  const view = useMemo(() => {
    if (focus == null) {
      // Whole map, calm: every edge drawn faintly, no labels.
      const edges: Edge[] = flow.edges.map((e): Edge => ({
        ...e,
        animated: false,
        label: undefined,
        data: { ...(e.data ?? {}), show: false },
        // resting: palette strokes shown (no labels — kept clean), a touch
        // stronger than before so the colours read.
        style: { ...e.style, opacity: 0.55 },
      }))
      return { nodes: flow.nodes, edges }
    }
    // Focused: keep ONLY the route through the picked node — but CURRENCY-STRICT.
    // Holding a specific tier currency (e.g. AXIS-EM-ATLAS from the Atlas card),
    // a multi-tier portal may continue ONLY on edges of that currency, not its
    // sibling tiers. So we walk (node, currency) STATES, not bare nodes: forward
    // follows outbound edges whose variant == the currency held; backward follows
    // inbound edges that DELIVER the currency held. Earn/buy edges (no variant)
    // pass freely. Then hide everything off-route and re-layout.
    type ED = { kind?: string; variant?: string; toCur?: string }
    const ed = (e: Edge) => (e.data ?? {}) as ED
    const litE = new Set<string>()
    const litN = new Set<string>([focus])
    const stateKey = (n: string, c: string) => `${n}\t${c}`

    // Pool members are 1:1 equivalent and their intra edges are hidden, so the
    // walk must treat reaching ONE member as reaching ALL of them — otherwise a
    // route that enters the pool at member A but leaves from member B dead-ends.
    const poolSiblings = new Map<string, string[]>()
    {
      const byPool = new Map<string, string[]>()
      for (const n of flow.nodes) {
        const pid = (n.data as NodeData | undefined)?.poolId
        if (pid) (byPool.get(pid) ?? byPool.set(pid, []).get(pid)!).push(n.id)
      }
      for (const ids of byPool.values()) for (const id of ids) poolSiblings.set(id, ids)
    }

    // Seed the currencies held AT the focus node.
    const focusKind = (flow.nodes.find((n) => n.id === focus)?.data as PathNode | undefined)?.kind
    const isSource = focusKind === 'card' || focusKind === 'fiat'
    const fwd: Array<{ node: string; cur: string }> = []
    const bwd: Array<{ node: string; cur: string }> = []
    if (isSource) {
      // A card/fiat produces a currency into the programme it feeds — light that
      // edge and walk forward from there. Nothing feeds a source, so no backward.
      for (const e of flow.edges) {
        const m = ed(e)
        if (e.source === focus && m.toCur) {
          litE.add(e.id)
          litN.add(e.target)
          fwd.push({ node: e.target, cur: m.toCur })
        }
      }
    } else {
      // A programme handles whatever currencies its edges carry — every tier it
      // can send (outbound variant) and receive (inbound toCur). The focus shows
      // the full route THROUGH this node: what reaches it AND where it leads.
      const curs = new Set<string>()
      for (const e of flow.edges) {
        const m = ed(e)
        if (e.source === focus && m.variant) curs.add(m.variant)
        if (e.target === focus && m.toCur) curs.add(m.toCur)
      }
      for (const c of curs) {
        fwd.push({ node: focus, cur: c })
        bwd.push({ node: focus, cur: c })
      }
    }

    const seenF = new Set(fwd.map((s) => stateKey(s.node, s.cur)))
    while (fwd.length) {
      const { node, cur } = fwd.pop()!
      // 1:1 pool: holding `cur` at one member means holding it at every member,
      // so their outbound edges apply too.
      for (const sib of poolSiblings.get(node) ?? []) {
        litN.add(sib)
        const sk = stateKey(sib, cur)
        if (!seenF.has(sk)) {
          seenF.add(sk)
          if (sib !== node) fwd.push({ node: sib, cur })
        }
      }
      for (const e of flow.edges) {
        if (e.source !== node) continue
        const m = ed(e)
        if (m.kind === 'transfer' && m.variant && m.variant !== cur) continue // strict
        litE.add(e.id)
        litN.add(e.target)
        const nc = m.toCur ?? cur
        const k = stateKey(e.target, nc)
        if (!seenF.has(k)) {
          seenF.add(k)
          fwd.push({ node: e.target, cur: nc })
        }
      }
    }
    // INBOUND: walk back from the focus over its feeders — everything that
    // reaches it (currency-strict, pool-aware). No dependency filtering.
    const seenB = new Set(bwd.map((s) => stateKey(s.node, s.cur)))
    while (bwd.length) {
      const { node, cur } = bwd.pop()!
      for (const sib of poolSiblings.get(node) ?? []) {
        litN.add(sib)
        const sk = stateKey(sib, cur)
        if (!seenB.has(sk)) {
          seenB.add(sk)
          if (sib !== node) bwd.push({ node: sib, cur })
        }
      }
      for (const e of flow.edges) {
        if (e.target !== node) continue
        const m = ed(e)
        if (m.kind === 'transfer' && m.toCur && m.toCur !== cur) continue // strict
        litE.add(e.id)
        litN.add(e.source)
        const pc = m.variant ?? cur
        const k = stateKey(e.source, pc)
        if (!seenB.has(k)) {
          seenB.add(k)
          bwd.push({ node: e.source, cur: pc })
        }
      }
    }

    const subEdges: Edge[] = flow.edges
      .filter((e) => litE.has(e.id))
      .map((e) => {
        const baseWidth = (e.style?.strokeWidth as number) ?? 1.2
        return {
          ...e,
          animated: true,
          label: e.label,
          data: { ...(e.data ?? {}), show: true },
          // Keep each edge's palette colour (+ its matching label) so the route's
          // hops stay distinguishable; emphasis is via opacity/weight, not colour.
          style: { ...e.style, opacity: 1, strokeWidth: baseWidth + 0.8 },
          labelStyle: { ...(e.labelStyle as object), fontWeight: 600 },
        }
      })
    // Re-lay out the isolated route WITH pool boxes (the same routine the full
    // graph uses) so the cluster still groups when a node is selected. Members
    // carry data.poolId from the full layout; the box node itself is dropped and
    // rebuilt. Preserve a node's own style (the box's width/height) when adding
    // the focus outline.
    const place: Node<NodeData>[] = flow.nodes
      .filter((n) => n.type !== 'pool' && litN.has(n.id))
      .map((n) => ({ ...n, position: { x: 0, y: 0 } }))
    const nodes = clusteredLayout(
      place,
      subEdges.map((e) => ({ source: e.source, target: e.target })),
      data.direction === 'from',
      data.target.slug,
    ).map((n) =>
      n.id === focus
        ? { ...n, style: { ...(n.style ?? {}), outline: `2px solid ${ACCENT}`, outlineOffset: 2, borderRadius: 8 } }
        : n,
    )
    return { nodes, edges: subEdges }
  }, [flow, focus, data?.target.slug, data?.direction])

  // Inject the per-node hide handler (bound to each node id) into card/programme
  // node data so the hover button can fire it. Targets/pools/fiat aren't hideable.
  const displayNodes = useMemo(
    () =>
      view.nodes.map((n) =>
        n.type === 'card' || n.type === 'program'
          ? { ...n, data: { ...n.data, onHide: () => props.onToggleHidden(n.id) } }
          : n,
      ),
    [view.nodes, props.onToggleHidden],
  )

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
  const filterCount = filters.hidden.size
  const focusName = focus ? (data?.nodes.find((n) => n.id === focus)?.display ?? null) : null
  const targetName = data?.target.display

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PlanToolbar>
        <Tabs value={direction} onValueChange={(v) => props.onDirection(v as 'to' | 'from')}>
          <TabsList className="h-8">
            <TabsTrigger value="to" className={cn('px-2.5 text-xs', TAB_ACTIVE)}>Booking</TabsTrigger>
            <TabsTrigger value="from" className={cn('px-2.5 text-xs', TAB_ACTIVE)}>Book from</TabsTrigger>
          </TabsList>
        </Tabs>
        <TargetCombobox value={target} onChange={onTarget} currencies={currencies} allowCards={fromMode} />
        {/* "My points" route-keeping is a booking-mode notion (in book-from the
            anchor IS your holding), so it only shows in booking mode. */}
        {!fromMode ? (
          <Tabs value={filters.mineOnly ? 'mine' : 'all'} onValueChange={(v) => props.onMineOnly(v === 'mine')}>
            <TabsList className="h-8">
              <TabsTrigger value="mine" className={cn('px-2.5 text-xs', TAB_ACTIVE)}>My points</TabsTrigger>
              <TabsTrigger value="all" className={cn('px-2.5 text-xs', TAB_ACTIVE)}>All points</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}

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
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground">Show on graph</h3>
                {filters.hidden.size > 0 ? (
                  <button
                    type="button"
                    onClick={props.onUnhideAll}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    <Eye className="size-3" /> Show all ({filters.hidden.size})
                  </button>
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tap a card or programme to hide it from the graph; tap again to bring it back.
              </p>

              <div className="space-y-1.5">
                <h4 className="text-[11px] font-semibold text-foreground/80">Cards</h4>
                {banks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No cards in these paths.</p>
                ) : (
                  banks.map((b) => {
                    const slugs = b.cards.map((c) => c.id)
                    const shown = slugs.filter((s) => !filters.hidden.has(s)).length
                    return (
                      <div key={b.issuer} className="space-y-1">
                        <button
                          type="button"
                          onClick={() => props.onToggleHiddenMany(slugs)}
                          className="text-[11px] font-semibold text-foreground hover:underline"
                          title="Hide / show all cards from this bank"
                        >
                          {b.issuer} {shown < slugs.length ? `(${shown}/${slugs.length})` : ''}
                        </button>
                        <div className="flex flex-wrap gap-1">
                          {b.cards.map((c) => (
                            <Chip key={c.id} on={!filters.hidden.has(c.id)} onClick={() => props.onToggleHidden(c.id)}>
                              {c.display}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="space-y-1.5">
                <h4 className="text-[11px] font-semibold text-foreground/80">Programmes</h4>
                <div className="flex flex-wrap gap-1">
                  {curOptions.map((c) => (
                    <Chip key={c.id} on={!filters.hidden.has(c.id)} onClick={() => props.onToggleHidden(c.id)}>
                      {c.display}
                    </Chip>
                  ))}
                </div>
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
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {fromMode ? 'Choose a programme or card you hold.' : 'Choose the points you want to reach.'}
          </div>
        ) : status === 'error' ? (
          <div className="flex h-full items-center justify-center text-sm text-destructive">{props.error ?? 'Something went wrong.'}</div>
        ) : (
          <ReactFlow
            // Remount on focus change so fitView re-frames the isolated route.
            key={focus ?? '__all__'}
            nodes={displayNodes}
            edges={view.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            minZoom={0.2}
            nodesDraggable={false}
            nodesConnectable={false}
            // Nodes aren't selectable/draggable (a one-finger drag that lands on
            // a node still pans the pane), but onNodeClick fires on a tap — that
            // drives the pick-to-reveal focus. A pane tap clears it.
            elementsSelectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            panOnDrag
            zoomOnPinch
            onNodeClick={(_, n) => {
              if (n.type === 'pool') return // the box itself isn't focusable
              setFocus((cur) => (cur === n.id ? null : n.id))
            }}
            onPaneClick={() => setFocus(null)}
          >
            <Background color="var(--border)" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
        {status === 'ready' ? (
          <div className="absolute inset-x-0 top-3 flex justify-center px-3">
            {focus == null ? (
              <span className="pointer-events-none flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-sm">
                <MousePointerClick className="size-3.5 shrink-0 text-muted-foreground" />
                Tap any card or programme to trace its route{!fromMode && targetName ? ` to ${targetName}` : ''}
              </span>
            ) : (
              <span className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1 text-xs shadow-sm">
                <span className="text-muted-foreground">Showing route for</span>
                <span className="font-semibold text-foreground">{focusName ?? 'selection'}</span>
                <button
                  type="button"
                  onClick={() => setFocus(null)}
                  className="ml-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3" /> Show all
                </button>
              </span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
