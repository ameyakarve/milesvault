'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  BaseEdge,
  Controls,
  Panel,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ELK from 'elkjs/lib/elk.bundled.js'
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

// ── ELK layout ───────────────────────────────────────────────────────────────
type ElkPt = { x: number; y: number }
type ElkRoutedEdge = { sections?: { startPoint: ElkPt; endPoint: ElkPt; bendPoints?: ElkPt[] }[] }
const W = 210
const H = 64
const elk = new ELK()
const ELK_OPTS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.spacing.nodeNodeBetweenLayers': '70',
  'elk.spacing.nodeNode': '30',
  'elk.spacing.edgeNode': '24',
  'elk.spacing.edgeEdge': '16',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '16',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
}

// Edge colour = the alliance the edge leads into (matching node tints), so
// converging/diverging links read distinctly; neutral when it lands on a
// non-alliance status.
function edgeColorFor(target: SmNode | undefined): string {
  const ak = target
    ? target.kind === 'alliance-tier'
      ? allianceOf(target.id)
      : allianceOf(target.confers?.[0]?.slug)
    : null
  return ak ? ALLIANCE[ak].swatch : '#94a3b8'
}

async function computeFlow(data: StatusMatchResult): Promise<{ nodes: Node<NodeData>[]; edges: Edge[] }> {
  if (!data.found) return { nodes: [], edges: [] }
  const fromId = data.from?.slug
  const toId = data.to?.slug
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]))
  const rfNodes: Node<NodeData>[] = data.nodes.map((n) => ({
    id: n.id,
    type: n.kind,
    position: { x: 0, y: 0 },
    data: { ...n, role: n.id === fromId ? 'from' : n.id === toId ? 'to' : 'mid' },
  }))
  const rfEdges: Edge[] = data.edges.map((e: SmEdge) => {
    const confers = e.matchKind === 'confers'
    const stroke = confers ? '#94a3b8' : edgeColorFor(nodeById.get(e.to))
    return {
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      type: 'routed',
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 16, height: 16 },
      style: {
        stroke,
        strokeWidth: 1.6,
        // paid matches dashed, conferral dotted, free solid.
        strokeDasharray: confers ? '2 3' : e.paid ? '6 4' : undefined,
      },
    }
  })
  let positions = new Map<string, { x: number; y: number }>()
  const routes = new Map<string, { x: number; y: number }[]>()
  try {
    const res = await elk.layout({
      id: 'root',
      layoutOptions: ELK_OPTS,
      children: rfNodes.map((n) => ({ id: n.id, width: W, height: H })),
      edges: rfEdges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
    })
    positions = new Map((res.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]))
    for (const e of res.edges ?? []) {
      const sec = (e as ElkRoutedEdge).sections?.[0]
      if (sec) routes.set(e.id, [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint])
    }
  } catch {
    /* fall back to origin if layout fails */
  }
  return {
    nodes: rfNodes.map((n) => ({ ...n, position: positions.get(n.id) ?? { x: 0, y: 0 } })),
    edges: rfEdges.map((e) => ({ ...e, data: { points: routes.get(e.id) } })),
  }
}

// Draw each edge along ELK's computed orthogonal route (so parallel edges sit in
// their own lanes instead of overlapping); arrowhead shows the match direction.
function RoutedEdge({ id, data, markerEnd, style, sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const pts = (data?.points as { x: number; y: number }[] | undefined) ?? []
  const path =
    pts.length >= 2
      ? `M${pts[0].x},${pts[0].y}` + pts.slice(1).map((p) => `L${p.x},${p.y}`).join('')
      : `M${sourceX},${sourceY}L${targetX},${targetY}`
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
}

const edgeTypes = { routed: RoutedEdge }

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
      <Handle type="target" position={Position.Top} className="!h-px !w-px !min-w-0 !border-0 !bg-transparent !opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!h-px !w-px !min-w-0 !border-0 !bg-transparent !opacity-0" />
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
      <Handle type="target" position={Position.Top} className="!h-px !w-px !min-w-0 !border-0 !bg-transparent !opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!h-px !w-px !min-w-0 !border-0 !bg-transparent !opacity-0" />
    </div>
  )
}

const nodeTypes = { 'status-tier': StatusNode, 'alliance-tier': AllianceNode }

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
          <div className="mb-1 font-semibold text-slate-700">Alliance status (node &amp; link)</div>
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
            <span className="w-4" style={{ borderTop: '2px solid #94a3b8' }} />
            <span className="text-slate-600">free match</span>
          </div>
        ) : null}
        {hasPaid ? (
          <div className="flex items-center gap-1.5">
            <span className="w-4" style={{ borderTop: '2px dashed #94a3b8' }} />
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
  const [flow, setFlow] = useState<{ nodes: Node<NodeData>[]; edges: Edge[] }>({ nodes: [], edges: [] })
  useEffect(() => {
    if (!data?.found) {
      setFlow({ nodes: [], edges: [] })
      return
    }
    let cancelled = false
    computeFlow(data)
      .then((f) => !cancelled && setFlow(f))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [data])
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
            key={`${data.from?.slug ?? ''}|${data.to?.slug ?? ''}|${flow.nodes.length}`}
            nodes={flow.nodes}
            edges={flow.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
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
