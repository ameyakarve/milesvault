import type { AirportLookup } from './award-engine'
import type { KbHttp } from './kb-tools'
import { computeAwardOptions } from './award-options'
import type { AwardPlanRow } from './award-plan'

// The data layer for the award EXPLORER page. The only input is the city pair;
// cabin, airline include/exclude, and stops are CLIENT-side filters over this
// one result set.
//
// It returns the card-agnostic award OPTIONS: every routing × programme × cabin
// with the programme's own published miles (cost/transfer fields blanked). The
// "how do I accumulate / transfer these miles" question — funding source,
// holdings affordability, transfer paths — lives entirely on the Points page
// (/points), which each row links to. The explorer itself is purely a flight
// + award-availability view and reads no card/ledger/transfer data.

type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
const CABINS: Cabin[] = ['economy', 'premium_economy', 'business', 'first']

export type ExploreAirline = { iata: string; name: string }

// Explorer rows are award-plan rows with the cost/transfer fields blanked — the
// table shows each programme's own miles, not a costed plan.
export type ExploreRow = AwardPlanRow

export type AwardExploreResult = {
  origin: string
  destination: string
  rows: ExploreRow[]
  airlines: ExploreAirline[]
  // slug → display_name, resolved from the KG, for every programme the rows
  // reference. The UI renders these; it must NOT hardcode names. Keyed by
  // `row.programme` (bare program slug).
  names: Record<string, string>
  // IATA → [lat, lng] for every airport in the routings (origin, destination,
  // hubs) — used to draw the flight map. From the DO's seeded airport table.
  airports: Record<string, [number, number]>
  notes: string[]
}

// ---- Best-effort IATA → display name via the KB airline nodes; falls back to the
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

// Resolve display_name from the KG for every programme in the rows. The map is
// keyed by exactly what the UI looks up: the bare programme slug (`row.programme`).
async function resolveNames(kb: KbHttp, rows: AwardPlanRow[]): Promise<Record<string, string>> {
  const wanted = new Set<string>()
  for (const r of rows) wanted.add(r.programme)
  const names: Record<string, string> = {}
  await Promise.all(
    [...wanted].map(async (programme) => {
      try {
        const n = (await kb.get(`program/${programme}`)) as { display_name?: string | null } | null
        if (n?.display_name) names[programme] = n.display_name
      } catch {
        /* leave unset — the UI falls back to a prettified slug */
      }
    }),
  )
  return names
}

export async function buildAwardExplore(
  lookup: AirportLookup,
  db: SqlStorage,
  apiKey: string,
  kb: KbHttp,
  origin: string,
  destination: string,
): Promise<AwardExploreResult> {
  const opts = await computeAwardOptions(lookup, db, apiKey, kb, origin, destination)
  const blankCost: AwardPlanRow['cost'] = {
    economy: null,
    premium_economy: null,
    business: null,
    first: null,
  }
  const rows: ExploreRow[] = opts.options.map(
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

  const [airlines, names] = await Promise.all([airlinesFrom(kb, rows), resolveNames(kb, rows)])

  // Coordinates for every airport in the routings (origin, destination, hubs).
  const codes = new Set<string>([opts.origin, opts.destination])
  for (const r of rows) for (const rt of r.routings) if (rt.hub) codes.add(rt.hub)
  const airports: Record<string, [number, number]> = {}
  for (const c of codes) {
    const a = lookup(c)
    if (a) airports[c] = [a[0], a[1]]
  }

  return { origin: opts.origin, destination: opts.destination, rows, airlines, names, airports, notes: opts.notes }
}

// re-exported for callers that only want the cabin constant
export { CABINS as EXPLORE_CABINS }
export type { Cabin as ExploreCabin }
