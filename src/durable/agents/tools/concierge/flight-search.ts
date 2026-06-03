import { tool } from 'ai'
import { z } from 'zod'
import { getAirportRoutes, type AirportRoute, type RouteOperator } from './routes-store'

// Discovers how to fly an origin→destination city pair from real schedule
// data (AeroDataBox `routes/daily`, 7-day cached per airport). It does NOT
// price anything — it answers "which routes/carriers exist", so the model
// can hand the legs to `award_quote`. One hop only: nonstop, or a single
// connecting hub served by both endpoints.

const flightSearchInputSchema = z.object({
  origin: z.string().describe('Origin airport IATA code, e.g. "BLR".'),
  destination: z.string().describe('Destination airport IATA code, e.g. "NRT".'),
})

const CARRIER = z.object({
  iata: z.string().nullable().describe('Airline IATA code; null if the source omitted it.'),
  name: z.string(),
})

const flightSearchOutputSchema = z.object({
  origin: z.string(),
  destination: z.string(),
  // Nonstop service, if any. `carriers` are the operating airlines.
  direct: z
    .object({ carriers: z.array(CARRIER), avgDaily: z.number() })
    .nullable(),
  // One-stop options: a hub served nonstop from BOTH origin and
  // destination. `toHub` = origin→hub carriers; `fromHub` = hub→destination
  // carriers. Sorted with the best-served hubs first.
  oneStop: z.array(
    z.object({
      hub: z.string(),
      toHub: z.array(CARRIER),
      fromHub: z.array(CARRIER),
    }),
  ),
  error: z.string().optional(),
})

type FlightSearchResult = z.infer<typeof flightSearchOutputSchema>

const MAX_HUBS = 30

// origin→hub frequency is unknown after intersection; rank by how well the
// hub is served on each leg (min of the two daily averages), busiest first.
function rank(a: { freq: number }, b: { freq: number }): number {
  return b.freq - a.freq
}

export function flightSearchTool(db: SqlStorage, apiKey: string) {
  return tool({
    description:
      'Find how to fly a city pair (origin→destination IATA) from real ' +
      'schedule data — nonstop carriers, and one-stop connections via a hub ' +
      'served by both endpoints — with the operating carrier(s) on each leg. ' +
      'Use this BEFORE `award_quote` whenever you need actual routes/carriers, ' +
      'especially when there is no nonstop: take the returned legs (each ' +
      'origin/hub/destination + carrier IATA) and price them with `award_quote`. ' +
      'Returns `direct` (nonstop carriers or null) and `oneStop` (hubs with ' +
      'per-leg carriers). It does NOT price — it only finds routes.',
    inputSchema: flightSearchInputSchema,
    outputSchema: flightSearchOutputSchema,
    execute: async ({ origin, destination }): Promise<FlightSearchResult> => {
      const o = origin.toUpperCase()
      const d = destination.toUpperCase()

      let oRoutes: AirportRoute[]
      let dRoutes: AirportRoute[]
      try {
        ;[oRoutes, dRoutes] = await Promise.all([
          getAirportRoutes(db, apiKey, o),
          getAirportRoutes(db, apiKey, d),
        ])
      } catch (err) {
        return {
          origin: o,
          destination: d,
          direct: null,
          oneStop: [],
          error: `route lookup failed: ${String(err)}`,
        }
      }

      // Nonstop origin→destination, if present in origin's route list.
      const directRoute = oRoutes.find((r) => r.dest === d)
      const direct = directRoute
        ? { carriers: directRoute.operators, avgDaily: directRoute.avgDaily }
        : null

      // Destination's nonstop routes ≈ routes INTO the destination (routes
      // are effectively bidirectional), keyed by hub for intersection.
      const intoDest = new Map<string, AirportRoute>()
      for (const r of dRoutes) intoDest.set(r.dest, r)

      const oneStop: Array<{
        hub: string
        toHub: RouteOperator[]
        fromHub: RouteOperator[]
        freq: number
      }> = []
      for (const r of oRoutes) {
        if (r.dest === d || r.dest === o) continue
        const back = intoDest.get(r.dest)
        if (!back) continue
        oneStop.push({
          hub: r.dest,
          toHub: r.operators,
          fromHub: back.operators,
          freq: Math.min(r.avgDaily, back.avgDaily),
        })
      }
      oneStop.sort(rank)

      return {
        origin: o,
        destination: d,
        direct,
        oneStop: oneStop.slice(0, MAX_HUBS).map(({ hub, toHub, fromHub }) => ({
          hub,
          toHub,
          fromHub,
        })),
      }
    },
  })
}
