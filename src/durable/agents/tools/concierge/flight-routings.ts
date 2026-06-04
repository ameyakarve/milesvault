import { getAirportRoutes, type RouteOperator } from './routes-store'
import { makeAirportLookup } from './airports-store'

// Shared routing computation over the 7-day-cached AeroDataBox route lists.
// Both flight_search (presentation) and award_options (pricing) build on this,
// so they agree on what counts as a direct / one-stop option.

// Reject a one-stop whose two legs total more than this multiple of the direct
// great-circle distance — i.e. the hub is a meaningful backtrack/detour, not a
// real connection (e.g. BLR-DOH-NRT ≈ 1.69× for an eastbound trip via the Gulf).
const DETOUR_FACTOR = 1.6

function haversineMi(a: readonly [number, number], b: readonly [number, number]): number {
  const R = 3959
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(h))
}

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

  // Direct great-circle baseline for the detour filter (computable even when
  // there's no nonstop flight). Null coords → skip the filter (don't drop on
  // missing data).
  const lookup = makeAirportLookup(db)
  const co = lookup(o)
  const cd = lookup(d)
  const maxOneStop =
    co && cd ? haversineMi([co[0], co[1]], [cd[0], cd[1]]) * DETOUR_FACTOR : Infinity

  // destination's nonstop routes ≈ routes INTO the destination, keyed by hub.
  const intoDest = new Map(dRoutes.map((r) => [r.dest, r]))
  for (const r of oRoutes) {
    if (r.dest === d || r.dest === o) continue
    const back = intoDest.get(r.dest)
    if (!back) continue
    // Drop detour hubs: total leg distance > DETOUR_FACTOR × direct.
    if (co && cd) {
      const ch = lookup(r.dest)
      if (ch) {
        const total =
          haversineMi([co[0], co[1]], [ch[0], ch[1]]) + haversineMi([ch[0], ch[1]], [cd[0], cd[1]])
        if (total > maxOneStop) continue
      }
    }
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
