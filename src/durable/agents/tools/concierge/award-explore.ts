import type { AirportLookup } from './award-engine'
import type { KbHttp } from './kb-tools'
import { computeAwardOptions } from './award-options'
import { buildAwardPlan, type AwardPlanRow } from './award-plan'

// The data layer for the fluid award EXPLORER page. Primary inputs are the city
// pair (+ an optional funding source); everything else — cabin, airline
// include/exclude, stops — is a CLIENT-side filter over this one result set.
//
// It always returns a uniform `rows` shape (AwardPlanRow):
//   - with a `source`  → fully costed in that card's points (delegates to
//     buildAwardPlan: every routing × programme × cabin, joined against the
//     transfers graph, with the path per row).
//   - without a source → the same rows but cost/transfer fields blanked; the
//     table shows the programme's own miles only.
// Plus `airlines`: the distinct operating carriers across all routings (names
// from the KB) for the include/exclude filter.

type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
const CABINS: Cabin[] = ['economy', 'premium_economy', 'business', 'first']

export type ExploreAirline = { iata: string; name: string }

export type AwardExploreResult = {
  origin: string
  destination: string
  source: string
  source_currency: string | null
  rows: AwardPlanRow[]
  airlines: ExploreAirline[]
  notes: string[]
}

// Best-effort IATA → display name via the KB airline nodes; falls back to the
// bare code so the filter always has a label.
async function airlineName(kb: KbHttp, iata: string): Promise<string> {
  try {
    const r = (await kb.resolve(iata, { prefix: 'airline' })) as {
      items?: Array<{ display_name: string | null }>
    }
    return r.items?.[0]?.display_name ?? iata
  } catch {
    return iata
  }
}

async function airlinesFrom(kb: KbHttp, rows: AwardPlanRow[]): Promise<ExploreAirline[]> {
  const codes = new Set<string>()
  for (const r of rows) for (const rt of r.routings) for (const c of rt.carriers) if (c) codes.add(c)
  return Promise.all(
    [...codes].sort().map(async (iata) => ({ iata, name: await airlineName(kb, iata) })),
  )
}

export async function buildAwardExplore(
  lookup: AirportLookup,
  db: SqlStorage,
  apiKey: string,
  kb: KbHttp,
  origin: string,
  destination: string,
  source?: string,
): Promise<AwardExploreResult> {
  // Costed path — reuse the full plan join, then enrich with the airline list.
  if (source && source.trim()) {
    const plan = await buildAwardPlan(lookup, db, apiKey, kb, origin, destination, source.trim())
    const airlines = await airlinesFrom(kb, plan.rows)
    return {
      origin: plan.origin,
      destination: plan.destination,
      source: plan.source,
      source_currency: plan.source_currency,
      rows: plan.rows,
      airlines,
      notes: plan.notes,
    }
  }

  // Miles-only path — card-agnostic options with cost/transfer fields blanked.
  const opts = await computeAwardOptions(lookup, db, apiKey, kb, origin, destination)
  const blankCost: AwardPlanRow['cost'] = {
    economy: null,
    premium_economy: null,
    business: null,
    first: null,
  }
  const rows: AwardPlanRow[] = opts.options.map(
    (o): AwardPlanRow => ({
      programme: o.programme,
      programme_currency: o.programme_currency,
      own_metal: o.own_metal,
      stops: o.stops,
      routings: o.routings,
      total_distance: o.total_distance,
      published: o.published,
      miles: o.cabins as AwardPlanRow['miles'],
      reachable: false,
      multiplier: null,
      hops: null,
      path: [],
      cost: { ...blankCost },
    }),
  )
  const airlines = await airlinesFrom(kb, rows)
  return {
    origin: opts.origin,
    destination: opts.destination,
    source: '',
    source_currency: null,
    rows,
    airlines,
    notes: opts.notes,
  }
}

// re-exported for callers that only want the cabin constant
export { CABINS as EXPLORE_CABINS }
export type { Cabin as ExploreCabin }
