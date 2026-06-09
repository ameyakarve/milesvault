'use client'

import { useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { ArrowRight, Check, ChevronsUpDown } from 'lucide-react'
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
import type {
  StatusMatchResult,
  MatchStatus,
  SmNode,
  SmEdge,
} from '@/durable/agents/tools/concierge/status-match-paths'

export type SmStatus = 'idle' | 'loading' | 'ready' | 'error'

type NodeData = SmNode & { role: 'from' | 'to' | 'mid' }

// ── alliance palette ─────────────────────────────────────────────────────────
type AllianceKey = 'star' | 'oneworld' | 'skyteam'
const ALLIANCE: Record<AllianceKey, { label: string; bg: string; border: string; text: string; swatch: string }> = {
  star: { label: 'Star Alliance', bg: '#fffbeb', border: '#fcd34d', text: '#92400e', swatch: '#f59e0b' },
  oneworld: { label: 'oneworld', bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8', swatch: '#3b82f6' },
  skyteam: { label: 'SkyTeam', bg: '#f5f3ff', border: '#c4b5fd', text: '#6d28d9', swatch: '#8b5cf6' },
}
function allianceOf(slug?: string): AllianceKey | null {
  if (!slug) return null
  const s = slug.replace(/^[a-z-]+\//, '')
  if (s.startsWith('star-alliance')) return 'star'
  if (s.startsWith('oneworld')) return 'oneworld'
  if (s.startsWith('skyteam')) return 'skyteam'
  return null
}

// ── dagre layout ─────────────────────────────────────────────────────────────
const W = 210
const H = 64
function layout(nodes: Node<NodeData>[], edges: Edge[]): Node<NodeData>[] {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 26, ranksep: 80, ranker: 'tight-tree', marginx: 24, marginy: 24 })
  g.setDefaultEdgeLabel(() => ({}))
  nodes.forEach((n) => g.setNode(n.id, { width: W, height: H }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map((n) => {
    const p = g.node(n.id)
    return { ...n, position: { x: p.x - W / 2, y: p.y - H / 2 } }
  })
}

// ── nodes ────────────────────────────────────────────────────────────────────
function StatusNode({ data }: NodeProps<Node<NodeData>>) {
  const conf = data.confers?.[0]
  const ak = allianceOf(conf?.slug)
  const pal = ak ? ALLIANCE[ak] : null
  const ring =
    data.role === 'from'
      ? 'ring-2 ring-emerald-400'
      : data.role === 'to'
        ? 'ring-2 ring-slate-900'
        : ''
  return (
    <div
      className={cn('flex h-[64px] w-[210px] flex-col justify-center gap-1 rounded-md border px-3 shadow-sm', ring)}
      style={{ background: pal?.bg ?? '#fff', borderColor: pal?.border ?? '#e2e8f0' }}
    >
      <div className="truncate text-xs font-semibold text-slate-900">{data.display}</div>
      <div className="flex items-center gap-1.5">
        {data.role !== 'mid' ? (
          <span className="text-[10px] font-medium text-muted-foreground">
            {data.role === 'from' ? 'you hold' : 'target'}
          </span>
        ) : null}
        {conf && pal ? (
          <span
            className="truncate rounded-sm px-1 py-px text-[9px] font-semibold"
            style={{ background: pal.swatch, color: '#fff' }}
          >
            {conf.display}
          </span>
        ) : null}
      </div>
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !bg-slate-400" />
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !bg-slate-400" />
    </div>
  )
}

function AllianceNode({ data }: NodeProps<Node<NodeData>>) {
  const ak = allianceOf(data.id)
  const pal = ak ? ALLIANCE[ak] : ALLIANCE.star
  const ring = data.role === 'to' ? 'ring-2 ring-slate-900' : ''
  return (
    <div
      className={cn('flex h-[64px] w-[210px] flex-col justify-center gap-0.5 rounded-md border px-3 shadow-sm', ring)}
      style={{ background: pal.bg, borderColor: pal.border }}
    >
      <div className="truncate text-xs font-semibold" style={{ color: pal.text }}>
        {data.display}
      </div>
      <div className="text-[10px]" style={{ color: pal.text, opacity: 0.75 }}>
        alliance status
      </div>
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !bg-slate-400" />
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !bg-slate-400" />
    </div>
  )
}

const nodeTypes = { 'status-tier': StatusNode, 'alliance-tier': AllianceNode }

function toFlow(data: StatusMatchResult): { nodes: Node<NodeData>[]; edges: Edge[] } {
  if (!data.found) return { nodes: [], edges: [] }
  const fromId = data.from?.slug
  const toId = data.to?.slug
  const rfNodes: Node<NodeData>[] = data.nodes.map((n) => ({
    id: n.id,
    type: n.kind,
    position: { x: 0, y: 0 },
    data: { ...n, role: n.id === fromId ? 'from' : n.id === toId ? 'to' : 'mid' },
  }))
  const rfEdges: Edge[] = data.edges.map((e: SmEdge) => {
    const confers = e.matchKind === 'confers'
    return {
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      type: 'smoothstep',
      animated: false,
      style: {
        stroke: confers ? '#cbd5e1' : e.paid ? '#f59e0b' : '#14b8a6',
        strokeWidth: 1.5,
        strokeOpacity: 0.85,
        strokeDasharray: confers ? '4 3' : undefined,
      },
    }
  })
  return { nodes: layout(rfNodes, rfEdges), edges: rfEdges }
}

// ── legend ───────────────────────────────────────────────────────────────────
function Legend({ data }: { data: StatusMatchResult }) {
  const present = new Set<AllianceKey>()
  for (const n of data.nodes) {
    const ak = n.kind === 'alliance-tier' ? allianceOf(n.id) : allianceOf(n.confers?.[0]?.slug)
    if (ak) present.add(ak)
  }
  const hasFree = data.edges.some((e) => e.matchKind !== 'confers' && !e.paid)
  const hasPaid = data.edges.some((e) => e.matchKind !== 'confers' && e.paid)
  if (present.size === 0 && !hasFree && !hasPaid) return null
  return (
    <div className="rounded-md border bg-white/95 px-2.5 py-2 text-[10px] shadow-sm backdrop-blur">
      {present.size ? (
        <div className="mb-1.5">
          <div className="mb-1 font-semibold text-slate-700">Confers alliance status</div>
          <div className="flex flex-col gap-0.5">
            {([...present] as AllianceKey[]).map((ak) => (
              <div key={ak} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: ALLIANCE[ak].swatch }} />
                <span className="text-slate-600">{ALLIANCE[ak].label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-0.5">
        {hasFree ? (
          <div className="flex items-center gap-1.5">
            <span className="h-[2px] w-4" style={{ background: '#14b8a6' }} />
            <span className="text-slate-600">free match</span>
          </div>
        ) : null}
        {hasPaid ? (
          <div className="flex items-center gap-1.5">
            <span className="h-[2px] w-4" style={{ background: '#f59e0b' }} />
            <span className="text-slate-600">paid match</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── from/to combobox ─────────────────────────────────────────────────────────
function StatusCombobox({
  value,
  onChange,
  statuses,
  placeholder,
  allowAny,
}: {
  value: string
  onChange: (slug: string) => void
  statuses: MatchStatus[]
  placeholder: string
  allowAny?: boolean
}) {
  const [open, setOpen] = useState(false)
  const label =
    statuses.find((s) => s.slug === value)?.name ?? (value ? value.replace(/^[a-z-]+\//, '') : placeholder)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="w-60 justify-between font-normal" />}>
        <span className="truncate">{label}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search a status — United Gold, oneworld Sapphire…" />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {allowAny ? (
                <CommandItem
                  value="any all matches"
                  onSelect={() => {
                    onChange('')
                    setOpen(false)
                  }}
                >
                  <Check className={cn('size-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                  <span className="text-muted-foreground">Any — show all matches</span>
                </CommandItem>
              ) : null}
              {statuses.map((s) => (
                <CommandItem
                  key={s.slug}
                  value={`${s.name} ${s.slug}`}
                  onSelect={() => {
                    onChange(s.slug)
                    setOpen(false)
                  }}
                >
                  <Check className={cn('size-4', value === s.slug ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{s.name}</span>
                  {s.kind === 'alliance-tier' ? (
                    <span className="ml-auto text-[10px] text-amber-600">alliance</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ── main ─────────────────────────────────────────────────────────────────────
export type SmProps = {
  from: string
  to: string
  onFrom: (slug: string) => void
  onTo: (slug: string) => void
  statuses: MatchStatus[]
  status: SmStatus
  data?: StatusMatchResult
  error?: string
}

export function StatusMatch(props: SmProps) {
  const { from, to, onFrom, onTo, statuses, status, data, error } = props
  const flow = useMemo(() => (data ? toFlow(data) : { nodes: [], edges: [] }), [data])
  // You can only match FROM a programme status you hold, not an alliance tier.
  const fromStatuses = useMemo(() => statuses.filter((s) => s.kind !== 'alliance-tier'), [statuses])
  const matchCount = data?.found ? data.edges.filter((e) => e.matchKind !== 'confers').length : 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-white/70 px-3 py-2">
        <span className="text-sm font-semibold text-slate-900">Status Match Merry-Go-Round</span>
        <div className="ml-2 flex items-center gap-2">
          <StatusCombobox value={from} onChange={onFrom} statuses={fromStatuses} placeholder="From status…" />
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          <StatusCombobox value={to} onChange={onTo} statuses={statuses} placeholder="To status (optional)…" allowAny />
        </div>
        {data?.found ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {matchCount} match{matchCount === 1 ? '' : 'es'}
            {to ? '' : ' available'}
          </span>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 bg-[#fbfbfa]">
        {status === 'idle' ? (
          <Centered>
            Pick a <b>from</b> status to map every match reachable from it — add a <b>to</b> status to see every way to get there.
          </Centered>
        ) : status === 'loading' ? (
          <Centered>Tracing the graph…</Centered>
        ) : status === 'error' ? (
          <Centered className="text-red-600">{error ?? 'Something went wrong.'}</Centered>
        ) : data && data.found ? (
          <ReactFlow
            nodes={flow.nodes}
            edges={flow.edges}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            minZoom={0.1}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            panOnDrag
            zoomOnPinch
          >
            <Background color="#e2e8f0" gap={20} />
            <Controls showInteractive={false} />
            <Panel position="top-right">
              <Legend data={data} />
            </Panel>
          </ReactFlow>
        ) : to ? (
          <Centered>
            No status-match path from <b>{data?.from?.display ?? from}</b> to{' '}
            <b>{data?.to?.display ?? to}</b> within 4 matches.
          </Centered>
        ) : (
          <Centered>
            No status matches available from <b>{data?.from?.display ?? from}</b>.
          </Centered>
        )}
      </div>
    </div>
  )
}

function Centered({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground', className)}>
      <p className="max-w-md">{children}</p>
    </div>
  )
}
