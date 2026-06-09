import type { KbHttp } from './kb-tools'

// Data layer for the "Status Match Merry-Go-Round" page. Given a FROM status and
// a TO status (each a programme status-tier or an alliance-tier), find a chain of
// status matches connecting them — a bounded BFS over MATCHES_TO edges. A held
// status-tier can also use matches sourced from the alliance-tier it CONFERS, so
// we expand those. The result is a React-Flow-ready path (nodes + match edges),
// or found=false if none within the hop cap.

export type SmKind = 'status-tier' | 'alliance-tier'
export type MatchStatus = { slug: string; name: string; kind: SmKind }

export type SmNode = { id: string; kind: SmKind; display: string }
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

// The searchable from/to universe: every status-tier + alliance-tier.
export async function listMatchStatuses(kb: KbHttp): Promise<MatchStatus[]> {
  const out: MatchStatus[] = []
  for (const kind of ['status-tier', 'alliance-tier'] as const) {
    try {
      const r = (await kb.list(kind, { limit: 2000 })) as { items?: string[] }
      for (const slug of r.items ?? []) out.push({ slug, name: prettySlug(slug), kind })
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
  if (!from || !to) {
    return { from: null, to: null, found: false, hops: 0, nodes: [], edges: [], notes: ['pick a from and to status'] }
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

  // Has a reached status-tier hit the target? (target may be an alliance-tier,
  // satisfied by any tier that CONFERS it.)
  const reaches = async (t: string): Promise<boolean> => {
    if (t === to) return true
    if (isAlliance(to)) return (await confersOf(t)).includes(to)
    return false
  }

  const parent = new Map<string, { prev: string; kind: string; paid: boolean; via: string | null }>()
  const visited = new Set<string>([from])
  let frontier = [from]
  let foundAt: string | null = null
  for (let depth = 0; depth < MAX_HOPS && frontier.length && !foundAt && visited.size < NODE_CAP; depth++) {
    const next: string[] = []
    for (const node of frontier) {
      for (const m of await outMatches(node)) {
        if (visited.has(m.grant)) continue
        visited.add(m.grant)
        parent.set(m.grant, { prev: node, kind: m.kind, paid: m.paid, via: m.via })
        if (await reaches(m.grant)) {
          foundAt = m.grant
          break
        }
        next.push(m.grant)
      }
      if (foundAt) break
    }
    frontier = next
  }

  if (!foundAt) {
    return {
      from: base(from),
      to: base(to),
      found: false,
      hops: 0,
      nodes: [],
      edges: [],
      notes: [`no status-match path found within ${MAX_HOPS} hops`],
    }
  }

  // Reconstruct from → foundAt.
  const edges: SmEdge[] = []
  const chain: string[] = [foundAt]
  let cur = foundAt
  while (parent.has(cur)) {
    const p = parent.get(cur)!
    edges.push({ from: p.prev, to: cur, matchKind: p.kind, paid: p.paid, viaAlliance: p.via })
    chain.push(p.prev)
    cur = p.prev
  }
  chain.reverse()
  edges.reverse()

  const nodeIds = new Set(chain)
  const nodes: SmNode[] = chain.map((s) => ({ id: s, kind: isAlliance(s) ? 'alliance-tier' : 'status-tier', display: display(s) }))
  // If the target is an alliance-tier reached via a conferring status-tier, show
  // the final CONFERS link to the alliance-tier node.
  if (isAlliance(to) && foundAt !== to) {
    if (!nodeIds.has(to)) nodes.push({ id: to, kind: 'alliance-tier', display: display(to) })
    edges.push({ from: foundAt, to, matchKind: 'confers', paid: false, viaAlliance: null })
  }

  return {
    from: base(from),
    to: base(to),
    found: true,
    hops: edges.filter((e) => e.matchKind !== 'confers').length,
    nodes,
    edges,
    notes: [],
  }
}
