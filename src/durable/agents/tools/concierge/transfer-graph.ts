import type { KbHttp } from './kb-tools'

// Transfers subgraph traversal. Currencies are nodes; TRANSFERS_TO edges
// (each carrying ratio_source:ratio_dest in its attrs) are directed arcs.
//
// The cost to obtain ONE destination-currency point from a source is the
// number of SOURCE points you must burn: multiplier = ratio_source/ratio_dest.
// Along a multi-hop path the multipliers compose (multiply). We find the
// cheapest (minimum-multiplier) path from each source to each destination,
// bounded by a hop cap — the graph has gain-edges (multiplier < 1, e.g. EDGE
// Miles 1:4), so an unbounded shortest-path could chase a money-pump; 1 hop
// covers virtually every real transfer anyway.

const MAX_HOPS = 3

export type TransferCell = {
  source: string
  dest: string
  // Source points required per 1 destination point, minimised over paths.
  // To cost N destination miles: N × multiplier.
  multiplier: number
  hops: number
  path: string[]
  // The first-hop edge's ratio — its ratio_source is the transfer block
  // (minimum), so award_options can round costs up to it. Only meaningful for
  // a direct (1-hop) path; null when the cheapest path is multi-hop.
  ratio_source: number | null
  ratio_dest: number | null
}

type Edge = { to: string; rs: number; rd: number }

// Memoised adjacency: a currency's outgoing TRANSFERS_TO edges + ratios.
function makeNeighbours(kb: KbHttp) {
  const cache = new Map<string, Edge[]>()
  return async (currency: string): Promise<Edge[]> => {
    const hit = cache.get(currency)
    if (hit) return hit
    let edges: Edge[] = []
    try {
      const r = (await kb.related(currency, {
        edge_type: 'TRANSFERS_TO',
        direction: 'outgoing',
      })) as { items?: Array<{ other: string; attrs?: Record<string, unknown> | null }> }
      edges = (r.items ?? [])
        .map((it): Edge | null => {
          const rs = Number(it.attrs?.ratio_source)
          const rd = Number(it.attrs?.ratio_dest)
          return Number.isFinite(rs) && Number.isFinite(rd) && rs > 0 && rd > 0
            ? { to: it.other, rs, rd }
            : null
        })
        .filter((e): e is Edge => e !== null)
    } catch {
      edges = []
    }
    cache.set(currency, edges)
    return edges
  }
}

// Cheapest (min cumulative multiplier) path from one source to every currency
// reachable within MAX_HOPS. Bounded Bellman-Ford: each round expands the
// frontier one hop and relaxes; updated nodes are re-expanded next round.
async function cheapestFrom(
  neighbours: (c: string) => Promise<Edge[]>,
  source: string,
): Promise<Map<string, TransferCell>> {
  type Best = { mult: number; hops: number; path: string[]; rs: number | null; rd: number | null }
  const best = new Map<string, Best>()
  best.set(source, { mult: 1, hops: 0, path: [source], rs: null, rd: null })
  let frontier = [source]
  for (let depth = 0; depth < MAX_HOPS && frontier.length; depth++) {
    const next: string[] = []
    for (const node of frontier) {
      const cur = best.get(node)!
      for (const e of await neighbours(node)) {
        if (e.to === source) continue
        const mult = cur.mult * (e.rs / e.rd)
        const prev = best.get(e.to)
        if (!prev || mult < prev.mult) {
          best.set(e.to, {
            mult,
            hops: cur.hops + 1,
            path: [...cur.path, e.to],
            // block size is only meaningful when the path is a single edge
            rs: cur.hops === 0 ? e.rs : null,
            rd: cur.hops === 0 ? e.rd : null,
          })
          next.push(e.to)
        }
      }
    }
    frontier = next
  }
  const out = new Map<string, TransferCell>()
  for (const [dest, b] of best) {
    if (dest === source) continue
    out.set(dest, {
      source,
      dest,
      multiplier: b.mult,
      hops: b.hops,
      path: b.path,
      ratio_source: b.rs,
      ratio_dest: b.rd,
    })
  }
  return out
}

// Core: rich cells for every (source, dest). A null cell = unreachable.
// Holding the destination currency directly is the zero-cost self-cell.
export async function transferGraph(
  kb: KbHttp,
  sources: string[],
  dests: string[],
): Promise<(TransferCell | null)[][]> {
  const neighbours = makeNeighbours(kb)
  const rows: (TransferCell | null)[][] = []
  for (const s of sources) {
    const reach = await cheapestFrom(neighbours, s)
    rows.push(
      dests.map((d) =>
        s === d
          ? { source: s, dest: d, multiplier: 1, hops: 0, path: [s], ratio_source: 1, ratio_dest: 1 }
          : (reach.get(d) ?? null),
      ),
    )
  }
  return rows
}

// Resolve free text / a card / a slug to a canonical currency slug. Done
// HERE (deterministically) so callers never hand the graph un-resolved names.
async function currencyOfCard(kb: KbHttp, card: string): Promise<string | null> {
  const d = (await kb.related(card, {
    edge_type: 'DENOMINATED_IN',
    direction: 'outgoing',
  })) as { items?: Array<{ other: string }> }
  return d.items?.find((i) => i.other.startsWith('currency/'))?.other ?? null
}

export async function resolveCurrency(kb: KbHttp, text: string): Promise<string | null> {
  const t = text.trim()
  if (t.startsWith('currency/')) return t
  if (t.startsWith('cc/')) return currencyOfCard(kb, t)
  const r = (await kb.resolve(t, { prefix: 'currency' })) as {
    items?: Array<{ slug: string }>
  }
  const top = r.items?.[0]?.slug
  if (top?.startsWith('currency/')) return top
  // Maybe a card name — resolve as a card, then map to its currency.
  const rc = (await kb.resolve(t, { prefix: 'cc' })) as { items?: Array<{ slug: string }> }
  const card = rc.items?.[0]?.slug
  if (card?.startsWith('cc/')) return currencyOfCard(kb, card)
  return null
}
