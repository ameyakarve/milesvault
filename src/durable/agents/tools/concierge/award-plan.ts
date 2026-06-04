import type { AirportLookup } from './award-engine'
import type { KbHttp } from './kb-tools'
import { computeAwardOptions, type AwardOptionsResult } from './award-options'
import { transferGraph, resolveCurrency, type TransferCell } from './transfer-graph'

// The complete, card-scoped award plan — the data behind the interactive
// award-options card. It runs the deterministic pipeline END TO END so the
// model never touches a number or decides a row: the fly-side
// (`computeAwardOptions`: every routing × every programme that can book it,
// priced on the real charts) JOINED against the transfers graph from the
// card's currency. EVERY combination is returned — reachable or not — each row
// annotated with its cheapest transfer path and the per-cabin points cost.
// Filtering/sorting is the client's job; this just computes the universe.

type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
const CABINS: Cabin[] = ['economy', 'premium_economy', 'business', 'first']

// A cabin cell as it flows through here: published [min,max] points, the string
// "dynamic" (bookable, no published rate), or null (cabin not offered).
type CabinCell = [number, number] | 'dynamic' | null

export type AwardPlanRow = {
  programme: string
  programme_currency: string | null
  own_metal: boolean
  stops: number
  routings: AwardOptionsResult['options'][number]['routings']
  total_distance: number
  published: boolean
  // Per-cabin award price in the PROGRAMME's own miles (the chart figure).
  miles: Record<Cabin, CabinCell>
  // Transfer from the card's currency into this programme's currency.
  reachable: boolean
  // Source points needed per 1 programme mile, cheapest path (null = unreachable).
  multiplier: number | null
  hops: number | null
  // Currency hops, source → … → programme_currency (empty if unreachable).
  path: string[]
  // Per-cabin cost in the CARD's points = miles × multiplier. null when the
  // programme is unreachable or the cabin isn't offered; "dynamic" passes through.
  cost: Record<Cabin, CabinCell>
}

export type AwardPlanResult = {
  origin: string
  destination: string
  // The raw `source` input (a card or currency name/slug) and what it resolved to.
  source: string
  source_currency: string | null
  rows: AwardPlanRow[]
  notes: string[]
}

function costCell(cell: CabinCell, mult: number | null): CabinCell {
  if (cell == null) return null
  if (cell === 'dynamic') return 'dynamic'
  if (mult == null) return null
  return [Math.round(cell[0] * mult), Math.round(cell[1] * mult)]
}

// The cheapest concrete points figure in a cabin cell, for sorting. null/dynamic
// sort last (no comparable number).
function sortValue(cell: CabinCell): number {
  return Array.isArray(cell) ? cell[0] : Number.POSITIVE_INFINITY
}

export async function buildAwardPlan(
  lookup: AirportLookup,
  db: SqlStorage,
  apiKey: string,
  kb: KbHttp,
  origin: string,
  destination: string,
  source: string,
): Promise<AwardPlanResult> {
  const opts = await computeAwardOptions(lookup, db, apiKey, kb, origin, destination)
  const notes = [...opts.notes]

  const sourceCurrency = await resolveCurrency(kb, source)
  if (!sourceCurrency) notes.push(`could not resolve a currency for source "${source}"`)

  // One cost-matrix walk: the source currency → every distinct programme currency.
  const cellByDest = new Map<string, TransferCell | null>()
  if (sourceCurrency && opts.dests.length) {
    const grid = await transferGraph(kb, [sourceCurrency], opts.dests)
    opts.dests.forEach((d, j) => cellByDest.set(d, grid[0]?.[j] ?? null))
  }

  const rows: AwardPlanRow[] = opts.options.map((o) => {
    const cur = o.programme_currency
    const cell = cur ? (cellByDest.get(cur) ?? null) : null
    const mult = cell ? cell.multiplier : null
    const reachable = mult != null
    const miles = o.cabins as Record<Cabin, CabinCell>
    const cost = {} as Record<Cabin, CabinCell>
    for (const c of CABINS) {
      cost[c] =
        reachable && o.published
          ? costCell(miles[c], mult)
          : miles[c] === 'dynamic'
            ? 'dynamic'
            : null
    }
    return {
      programme: o.programme,
      programme_currency: cur,
      own_metal: o.own_metal,
      stops: o.stops,
      routings: o.routings,
      total_distance: o.total_distance,
      published: o.published,
      miles,
      reachable,
      multiplier: mult,
      hops: cell ? cell.hops : null,
      path: cell ? cell.path : [],
      cost,
    }
  })

  // Default order: reachable first, then cheapest business-cabin cost, then
  // economy, then shorter distance. The client re-sorts freely on top of this.
  rows.sort((a, b) => {
    if (a.reachable !== b.reachable) return a.reachable ? -1 : 1
    const bizA = sortValue(a.cost.business)
    const bizB = sortValue(b.cost.business)
    if (bizA !== bizB) return bizA - bizB
    const ecoA = sortValue(a.cost.economy)
    const ecoB = sortValue(b.cost.economy)
    if (ecoA !== ecoB) return ecoA - ecoB
    return a.total_distance - b.total_distance
  })

  return {
    origin: opts.origin,
    destination: opts.destination,
    source,
    source_currency: sourceCurrency,
    rows,
    notes,
  }
}
