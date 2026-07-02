// Type boundary for the (plain-JS) award engine. The .js internals are
// ported verbatim and validated at runtime; this is the surface the tool
// compiles against.

export interface InputLeg {
  origin: string
  destination: string
  carrier?: string | null
}

// [lat, lng, isoCountryCode]
export type AirportRow = [number, number, string]
export type AirportLookup = (iata: string) => AirportRow | null

// [min, max] miles for a cabin, or null if not offered.
export type CabinRange = [number, number] | null

export interface Entry {
  programme: string
  chart: string
  season: string
  // When true, the cabin values are saver FLOORS with dynamic pricing above them
  // (no published ceiling) — surfaced by the tier model as {from, to:null}.
  floor?: boolean
  economy: CabinRange
  premium_economy: CabinRange
  business: CabinRange
  first: CabinRange
}

export interface ResolvedLeg {
  origin: string
  destination: string
  carrier: string | null
  distance: number
  origin_cc: string
  destination_cc: string
  origin_lat: number
  origin_lng: number
  destination_lat: number
  destination_lng: number
}

export interface ProgrammeModule {
  bookable: Set<string>
  handle: (legs: ResolvedLeg[], totalDistance: number) => Entry[]
}

export const PROGRAMMES: Record<string, ProgrammeModule>

export function resolveProgrammeId(text: string): string | null

export function resolveLegs(
  legs: InputLeg[],
  lookup: AirportLookup,
):
  | { error: string }
  | { legs: ResolvedLeg[]; total_distance: number }

export function priceProgramme(
  id: string,
  legs: InputLeg[],
  lookup: AirportLookup,
):
  | { error: string }
  | { entries: Entry[]; resolved: { legs: ResolvedLeg[]; total_distance: number } }

export function priceItinerary(
  legs: InputLeg[],
  lookup: AirportLookup,
): { error: string } | { legs: ResolvedLeg[]; total_distance: number; charts: Entry[] }
