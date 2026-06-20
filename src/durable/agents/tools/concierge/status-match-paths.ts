import type { KbHttp } from './kb-tools'

// Data layer for the "Status Match Merry-Go-Round" page. Given a FROM status and
// a TO status (each a programme status-tier or an alliance-tier), find a chain of
// status matches connecting them — a bounded BFS over MATCHES_TO edges. A held
// status-tier can also use matches sourced from the alliance-tier it CONFERS, so
// we expand those. The result is a React-Flow-ready path (nodes + match edges),
// or found=false if none within the hop cap.

export type SmKind = 'status-tier' | 'alliance-tier'
export type MatchStatus = { slug: string; name: string; kind: SmKind }

export type SmNode = {
  id: string
  kind: SmKind
  display: string
  // For a status-tier: the alliance status it CONFERS (shown as the node's
  // colour rather than a separate node), if any.
  confers?: { slug: string; display: string }[]
}
export type SmEdge = {
  from: string
  to: string
  // 'match' | 'challenge' | 'hybrid' for a real match; 'confers' for the final
  // CONFERS link when the target is an alliance-tier.
  matchKind: string
  paid: boolean
  // The alliance-tier the match was sourced through (e.g. you hold X which
  // confers oneworld Sapphire and the offer accepts "any oneworld Sapphire"),
  // or null for a direct status-tier → status-tier match.
  viaAlliance: string | null
}

export type StatusMatchResult = {
  from: { slug: string; display: string } | null
  to: { slug: string; display: string } | null
  found: boolean
  hops: number
  nodes: SmNode[]
  edges: SmEdge[]
  notes: string[]
}

const MAX_HOPS = 4
const NODE_CAP = 600

const isAlliance = (s: string) => s.startsWith('alliance-tier/')
const prettySlug = (slug: string) =>
  slug
    .replace(/^[a-z-]+\//, '')
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')

// The match-statuses RPC result: the searchable universe plus the tier slugs
// the user currently holds (from `event "status:<program>" "<tier>"` ledger
// directives — see experience.md §10; empty when none are recorded).
export type MatchStatusesResult = { statuses: MatchStatus[]; held: string[] }

// Reduce `status:*` event directive rows (ordered oldest→newest) to the
// user's current tier slugs: latest value per program wins, empty value
// clears, and only values naming a real status-tier in `universe` survive.
// Values may be bare (`united-premier-gold`) or full (`status-tier/...`).
export function heldStatusSlugs(
  rows: ReadonlyArray<{ name: string; value: string }>,
  universe: ReadonlyArray<MatchStatus>,
): string[] {
  const latest = new Map<string, string>()
  for (const r of rows) latest.set(r.name, r.value.trim())
  const known = new Set(universe.filter((s) => s.kind === 'status-tier').map((s) => s.slug))
  const held: string[] = []
  for (const v of latest.values()) {
    const slug = known.has(v) ? v : known.has(`status-tier/${v}`) ? `status-tier/${v}` : null
    if (slug && !held.includes(slug)) held.push(slug)
  }
  return held
}

// The searchable from/to universe: every status-tier + alliance-tier.
export async function listMatchStatuses(kb: KbHttp): Promise<MatchStatus[]> {
  const out: MatchStatus[] = []
  for (const kind of ['status-tier', 'alliance-tier'] as const) {
    try {
      const r = (await kb.list(kind, { limit: 2000 })) as { items?: Array<{ slug: string }> }
      for (const { slug } of r.items ?? []) out.push({ slug, name: prettySlug(slug), kind })
    } catch {
      /* ignore */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

type RelItem = { other: string; attrs?: Record<string, unknown> | null }

function memoize<T>(fn: (s: string) => Promise<T>): (s: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>()
  return (s) => {
    const hit = cache.get(s)
    if (hit) return hit
    const p = fn(s)
    cache.set(s, p)
    return p
  }
}

export async function buildStatusMatchPaths(
  kb: KbHttp,
  fromText: string,
  toText: string,
): Promise<StatusMatchResult> {
  const from = fromText.trim()
  const to = toText.trim()
  const display = (s: string) => prettySlug(s)
  const base = (slug: string) => ({ slug, display: display(slug) })
  if (!from) {
    return { from: null, to: null, found: false, hops: 0, nodes: [], edges: [], notes: ['pick a from status'] }
  }

  const matchesFrom = memoize(async (slug: string): Promise<RelItem[]> => {
    try {
      const r = (await kb.related(slug, { edge_type: 'MATCHES_TO', direction: 'outgoing' })) as {
        items?: RelItem[]
      }
      return r.items ?? []
    } catch {
      return []
    }
  })
  const confersOf = memoize(async (slug: string): Promise<string[]> => {
    try {
      const r = (await kb.related(slug, { edge_type: 'CONFERS', direction: 'outgoing' })) as {
        items?: Array<{ other: string }>
      }
      return (r.items ?? []).map((i) => i.other).filter(isAlliance)
    } catch {
      return []
    }
  })

  // Matches usable while holding `slug`: direct MATCHES_TO from it, plus matches
  // sourced from the alliance-tier(s) it confers (status-tiers only).
  const outMatches = async (slug: string) => {
    const res: Array<{ grant: string; kind: string; paid: boolean; via: string | null }> = []
    for (const it of await matchesFrom(slug)) {
      res.push({ grant: it.other, kind: String(it.attrs?.kind ?? 'match'), paid: it.attrs?.paid === true, via: null })
    }
    if (!isAlliance(slug)) {
      for (const at of await confersOf(slug)) {
        for (const it of await matchesFrom(at)) {
          res.push({ grant: it.other, kind: String(it.attrs?.kind ?? 'match'), paid: it.attrs?.paid === true, via: at })
        }
      }
    }
    return res
  }

  // Enrich the result graph: for every visible status-tier, surface the
  // alliance status it confers (node + dashed CONFERS edge), so the user sees
  // e.g. "United Premier Gold" is tagged as conferring "Star Alliance Gold",
  // which the UI shows via the node's colour + a legend (not a separate node).
  const tagConfers = async (nodes: SmNode[]) => {
    for (const n of nodes) {
      if (n.kind !== 'status-tier') continue
      const ats = await confersOf(n.id)
      if (ats.length) n.confers = ats.map((at) => ({ slug: at, display: display(at) }))
    }
  }

  // Forward BFS: build the FULL graph reachable from `from` via status matches
  // (expanding alliance-sourced matches through CONFERS), bounded by hops + cap.
  const depthOf = new Map<string, number>([[from, 0]])
  const adj = new Map<string, Array<{ grant: string; kind: string; paid: boolean; via: string | null }>>()
  let frontier = [from]
  for (let d = 0; d < MAX_HOPS && frontier.length && depthOf.size < NODE_CAP; d++) {
    const next: string[] = []
    for (const node of frontier) {
      const ms = await outMatches(node)
      adj.set(node, ms)
      for (const m of ms) {
        if (!depthOf.has(m.grant)) {
          depthOf.set(m.grant, d + 1)
          next.push(m.grant)
        }
      }
    }
    frontier = next
  }

  // Every distinct match edge among reached nodes.
  const allEdges: SmEdge[] = []
  const seenEdge = new Set<string>()
  for (const [node, ms] of adj) {
    for (const m of ms) {
      const key = `${node}->${m.grant}`
      if (seenEdge.has(key)) continue
      seenEdge.add(key)
      allEdges.push({ from: node, to: m.grant, matchKind: m.kind, paid: m.paid, viaAlliance: m.via })
    }
  }

  // Targeted mode: keep only nodes/edges on some path from `from` to the target
  // (a status-tier, or any reached tier that CONFERS an alliance-tier target).
  // Untargeted mode: keep the whole reachable graph.
  let keep: Set<string>
  const goals: string[] = []
  if (to) {
    for (const s of depthOf.keys()) {
      if (s === to) goals.push(s)
      else if (isAlliance(to) && (await confersOf(s)).includes(to)) goals.push(s)
    }
    if (goals.length === 0) {
      return { from: base(from), to: base(to), found: false, hops: 0, nodes: [], edges: [], notes: [`no status-match path found within ${MAX_HOPS} hops`] }
    }
    const rev = new Map<string, string[]>()
    for (const e of allEdges) (rev.get(e.to) ?? rev.set(e.to, []).get(e.to)!).push(e.from)
    keep = new Set(goals)
    const stack = [...goals]
    while (stack.length) {
      const cur = stack.pop()!
      for (const prev of rev.get(cur) ?? []) {
        if (!keep.has(prev)) {
          keep.add(prev)
          stack.push(prev)
        }
      }
    }
    if (!keep.has(from)) {
      return { from: base(from), to: base(to), found: false, hops: 0, nodes: [], edges: [], notes: [`no status-match path found within ${MAX_HOPS} hops`] }
    }
  } else {
    keep = new Set(depthOf.keys())
  }

  if (allEdges.filter((e) => keep.has(e.from) && keep.has(e.to)).length === 0) {
    return { from: base(from), to: to ? base(to) : null, found: false, hops: 0, nodes: [], edges: [], notes: ['no status matches available from this status'] }
  }

  const nodes: SmNode[] = [...keep].map((s) => ({ id: s, kind: isAlliance(s) ? 'alliance-tier' : 'status-tier', display: display(s) }))
  const edges: SmEdge[] = allEdges.filter((e) => keep.has(e.from) && keep.has(e.to))
  // Alliance-tier target: show the final CONFERS link from each goal tier.
  if (to && isAlliance(to)) {
    if (!keep.has(to)) nodes.push({ id: to, kind: 'alliance-tier', display: display(to) })
    for (const g of goals) edges.push({ from: g, to, matchKind: 'confers', paid: false, viaAlliance: null })
  }
  await tagConfers(nodes)
  const hops = to ? Math.min(...goals.map((g) => depthOf.get(g) ?? Infinity)) : 0
  return { from: base(from), to: to ? base(to) : null, found: true, hops, nodes, edges, notes: [] }
}
