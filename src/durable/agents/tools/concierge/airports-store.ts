import type { AirportLookup, AirportRow } from './award-engine'
import type { KbHttp } from './kb-tools'

// Airports resolve from the milesvault-kb corpus: each `airport/<iata>` node
// carries `cc`, `lat`, `lng` attrs. We fetch the airports a request touches by
// id in ONE batched call (kb_get_many) — no local table, no bulk seed. The award
// engine still consumes a SYNCHRONOUS lookup, so callers fetch up front into a
// Map (fetchAirports) and hand the engine a Map-backed lookup (makeAirportLookup).

export type AirportCache = Map<string, AirportRow>

// Batch-resolve IATA codes → [lat, lng, cc] via kb_get_many. Malformed / unknown
// airports are simply absent from the map (lookup returns null for them).
export async function fetchAirports(
  kb: KbHttp,
  iatas: Iterable<string>,
): Promise<AirportCache> {
  const codes = [
    ...new Set(
      [...iatas].map((i) => String(i).toUpperCase()).filter((i) => /^[A-Z]{3}$/.test(i)),
    ),
  ]
  const cache: AirportCache = new Map()
  if (codes.length === 0) return cache
  const res = (await kb.getMany(
    codes.map((i) => `airport/${i.toLowerCase()}`),
    { fields: ['cc', 'lat', 'lng'] },
  )) as { items?: Array<{ slug: string; fields?: Record<string, unknown> }> }
  for (const it of res.items ?? []) {
    const iata = it.slug.replace(/^airport\//, '').toUpperCase()
    const f = it.fields ?? {}
    const lat = Number(f.lat)
    const lng = Number(f.lng)
    const cc = typeof f.cc === 'string' ? f.cc : ''
    if (Number.isFinite(lat) && Number.isFinite(lng) && /^[A-Z]{2}$/.test(cc)) {
      cache.set(iata, [lat, lng, cc])
    }
  }
  return cache
}

// Synchronous IATA → [lat, lng, cc] over an already-fetched cache. Injected into
// the award engine, which resolves legs synchronously.
export function makeAirportLookup(cache: AirportCache): AirportLookup {
  return (iata: string): AirportRow | null => cache.get(String(iata).toUpperCase()) ?? null
}
