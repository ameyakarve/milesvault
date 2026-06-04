import { getAirportRoutes, type RouteOperator } from './routes-store'

// Shared routing computation over the 7-day-cached AeroDataBox route lists.
// Both flight_search (presentation) and award_options (pricing) build on this,
// so they agree on what counts as a direct / one-stop option.

export interface RoutingLeg {
  origin: string
  destination: string
  carriers: RouteOperator[] // operating carriers on this leg (iata may be null)
}

export interface Routing {
  hub: string | null // null = nonstop
  legs: RoutingLeg[]
  // min daily frequency across the legs (∞ for direct) — used only to break
  // ties / rank hubs when distance is unavailable.
  minDaily: number
}

// Direct + one-stop routings for an O&D. Two cached route-list reads, then a
// local intersection: a hub is any airport served nonstop from BOTH ends.
export async function computeRoutings(
  db: SqlStorage,
  apiKey: string,
  origin: string,
  destination: string,
): Promise<Routing[]> {
  const o = origin.toUpperCase()
  const d = destination.toUpperCase()
  const [oRoutes, dRoutes] = await Promise.all([
    getAirportRoutes(db, apiKey, o),
    getAirportRoutes(db, apiKey, d),
  ])

  const routings: Routing[] = []

  const direct = oRoutes.find((r) => r.dest === d)
  if (direct) {
    routings.push({
      hub: null,
      minDaily: direct.avgDaily,
      legs: [{ origin: o, destination: d, carriers: direct.operators }],
    })
  }

  // destination's nonstop routes ≈ routes INTO the destination, keyed by hub.
  const intoDest = new Map(dRoutes.map((r) => [r.dest, r]))
  for (const r of oRoutes) {
    if (r.dest === d || r.dest === o) continue
    const back = intoDest.get(r.dest)
    if (!back) continue
    routings.push({
      hub: r.dest,
      minDaily: Math.min(r.avgDaily, back.avgDaily),
      legs: [
        { origin: o, destination: r.dest, carriers: r.operators },
        { origin: r.dest, destination: d, carriers: back.operators },
      ],
    })
  }

  return routings
}
