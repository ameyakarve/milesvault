import { tool } from 'ai'
import { z } from 'zod'
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

const round4 = (n: number) => Math.round(n * 1e4) / 1e4

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

const matrixInput = z.object({
  sources: z
    .array(z.string())
    .describe('Currencies (or cards) you transfer FROM — slugs or names; resolved internally.'),
  dests: z
    .array(z.string())
    .describe('Destination currencies you transfer INTO — slugs or names; resolved internally.'),
})

const matrixOutput = z.object({
  sources: z.array(z.string()).describe('Resolved source currency slugs, row order.'),
  dests: z.array(z.string()).describe('Resolved destination currency slugs, column order.'),
  matrix: z
    .array(z.array(z.number()))
    .describe(
      'matrix[i][j] = SOURCE points needed per 1 DESTINATION point (cost = dest_miles × this), ' +
        'min over paths up to 3 hops. -1 = unreachable. 1 = you already hold it.',
    ),
  unresolved: z.array(z.string()).describe('Inputs that did not resolve to a currency.'),
})

// Standalone tool: a numeric cost matrix over the transfers subgraph. Great
// reranker fuel — "EDGE RP → KrisFlyer 1.25, → Avios 2.5, → Aeroplan -1".
export function transferMatrixTool(kb: KbHttp) {
  return tool({
    description:
      'Cost matrix for moving points across reward currencies via the transfers graph. ' +
      'Give the currencies (or cards) you hold as `sources` and the ones you want as `dests`; ' +
      'returns matrix[i][j] = source points needed per 1 destination point (cheapest path, ≤3 ' +
      'hops; -1 if unreachable, 1 if already held). Cost of N destination miles = N × the cell. ' +
      'Use it to see which of a card\'s currencies can fund which programme, and how dearly.',
    inputSchema: matrixInput,
    outputSchema: matrixOutput,
    execute: async ({ sources, dests }) => {
      const [rs, rd] = await Promise.all([
        Promise.all(sources.map((s) => resolveCurrency(kb, s))),
        Promise.all(dests.map((d) => resolveCurrency(kb, d))),
      ])
      const unresolved = [
        ...sources.filter((_, i) => !rs[i]),
        ...dests.filter((_, i) => !rd[i]),
      ]
      const S = rs.filter((s): s is string => !!s)
      const D = rd.filter((d): d is string => !!d)
      const cells = await transferGraph(kb, S, D)
      const matrix = cells.map((row) => row.map((c) => (c ? round4(c.multiplier) : -1)))
      return { sources: S, dests: D, matrix, unresolved }
    },
  })
}
