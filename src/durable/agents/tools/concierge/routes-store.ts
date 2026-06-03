// Route data from AeroDataBox (api.market gateway), cached in the
// ConciergeDO's own SQLite. The unit we cache is one airport's
// `routes/daily` response — "everywhere you can fly from X, on which
// carriers" — aggregated by the API over a rolling 7-day window. We hold
// each airport's list for 7 days, so a city-pair search costs at most two
// API calls when both airports are cold and zero when both are warm.

const TABLE = `CREATE TABLE IF NOT EXISTS route_cache (
  iata       TEXT PRIMARY KEY,
  json       TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
)`

const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const BASE = 'https://prod.api.market/api/v1/aedbx/aerodatabox'

// One airline operating a route. `iata` can be null — low-frequency or
// seasonal operators sometimes come back named but without a code (e.g.
// the sparse JAL BLR–NRT row), so callers keep `name` as a fallback.
export interface RouteOperator {
  iata: string | null
  name: string
}

// One destination reachable nonstop from the queried airport.
export interface AirportRoute {
  dest: string
  avgDaily: number
  operators: RouteOperator[]
}

// Subset of the AeroDataBox DailyRouteStatContract we consume.
interface ApiResponse {
  routes?: Array<{
    destination?: { iata?: string | null }
    averageDailyFlights?: number
    operators?: Array<{ iata?: string | null; name?: string }>
  }>
}

export function ensureRouteCache(db: SqlStorage): void {
  db.exec(TABLE)
}

async function fetchRoutes(apiKey: string, iata: string): Promise<AirportRoute[]> {
  const res = await fetch(
    `${BASE}/airports/iata/${iata}/stats/routes/daily`,
    { headers: { 'x-magicapi-key': apiKey, accept: 'application/json' } },
  )
  if (!res.ok) throw new Error(`aerodatabox routes/daily ${iata}: HTTP ${res.status}`)
  const data = (await res.json()) as ApiResponse
  const out: AirportRoute[] = []
  for (const r of data.routes ?? []) {
    const dest = r.destination?.iata
    if (!dest) continue
    out.push({
      dest: dest.toUpperCase(),
      avgDaily: r.averageDailyFlights ?? 0,
      operators: (r.operators ?? []).map((o) => ({
        iata: o.iata ? o.iata.toUpperCase() : null,
        name: o.name ?? '',
      })),
    })
  }
  return out
}

// 7-day cached `routes/daily` for one airport. On a cache miss (or expiry)
// we refetch; if the API call fails but we hold any prior copy, we serve
// the stale copy rather than failing the search.
export async function getAirportRoutes(
  db: SqlStorage,
  apiKey: string,
  iata: string,
): Promise<AirportRoute[]> {
  const code = iata.toUpperCase()
  const cached = db
    .exec('SELECT json, fetched_at FROM route_cache WHERE iata = ?', code)
    .toArray()[0]

  if (cached && Date.now() - (cached.fetched_at as number) < TTL_MS) {
    return JSON.parse(cached.json as string) as AirportRoute[]
  }

  try {
    const routes = await fetchRoutes(apiKey, code)
    db.exec(
      'INSERT OR REPLACE INTO route_cache (iata, json, fetched_at) VALUES (?, ?, ?)',
      code,
      JSON.stringify(routes),
      Date.now(),
    )
    return routes
  } catch (err) {
    if (cached) return JSON.parse(cached.json as string) as AirportRoute[]
    throw err
  }
}
