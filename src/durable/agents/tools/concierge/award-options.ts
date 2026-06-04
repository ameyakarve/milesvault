import { tool } from 'ai'
import { z } from 'zod'
import { PROGRAMMES, resolveProgrammeId, priceProgramme } from './award-engine'
import type { AirportLookup, Entry, CabinRange } from './award-engine'
import { computeRoutings, type Routing } from './flight-routings'
import type { KbHttp } from './kb-tools'

// Deterministic "best award options for this O&D on this card" tool. Removes
// the model from the assembly loop: it finds the routings (direct + one-stop),
// for each candidate programme picks a bookable carrier per leg (preferring the
// programme's own metal), prices every routing × programme through the engine,
// flags own-metal from the KB OWN_METAL edge, and returns a single ranked list
// — directs first, then hops by total distance, own-metal first within a route.

const CABIN = z
  .tuple([z.number(), z.number()])
  .nullable()
  .describe('[min, max] miles for the cabin, or null if not offered.')

const awardOptionsInputSchema = z.object({
  origin: z.string().describe('Origin airport IATA, e.g. "BLR".'),
  destination: z.string().describe('Destination airport IATA, e.g. "NRT".'),
  programmes: z
    .array(z.string())
    .min(1)
    .describe(
      'Programmes to price — milesvault-kg programme slugs ("program/krisflyer", ' +
        '"program/jal-mileage-bank") or names. Usually the card\'s reachable transfer partners.',
    ),
})

const awardOptionsOutputSchema = z.object({
  origin: z.string(),
  destination: z.string(),
  options: z.array(
    z.object({
      hub: z.string().nullable().describe('Connecting hub IATA, or null for nonstop.'),
      carriers: z.array(z.string()).describe('Chosen operating carrier IATA per leg.'),
      total_distance: z.number().describe('Great-circle miles flown over the routing.'),
      programme: z.string().describe('milesvault-kg programme slug actually priced.'),
      own_metal: z.boolean().describe('True if every leg flies the programme’s own metal.'),
      economy: CABIN,
      premium_economy: CABIN,
      business: CABIN,
      first: CABIN,
    }),
  ),
  notes: z.array(z.string()).describe('Programmes that did not resolve / price, etc.'),
})

type AwardOptionsResult = z.infer<typeof awardOptionsOutputSchema>
type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
const CABINS: Cabin[] = ['economy', 'premium_economy', 'business', 'first']
const MAX_OPTIONS = 80

function aggregateCabins(entries: Entry[]): Record<Cabin, CabinRange> {
  const agg: Record<Cabin, CabinRange> = {
    economy: null,
    premium_economy: null,
    business: null,
    first: null,
  }
  for (const e of entries) {
    for (const c of CABINS) {
      const r = e[c]
      if (!r) continue
      const cur = agg[c]
      agg[c] = cur ? [Math.min(cur[0], r[0]), Math.max(cur[1], r[1])] : [r[0], r[1]]
    }
  }
  return agg
}

async function airlineSlugFor(kb: KbHttp, iata: string): Promise<string | null> {
  try {
    const r = (await kb.resolve(iata, { prefix: 'airline' })) as {
      items?: Array<{ slug: string }>
    }
    return r.items?.[0]?.slug ?? null
  } catch {
    return null
  }
}

async function ownMetalSlugs(kb: KbHttp, kgSlug: string): Promise<Set<string>> {
  try {
    const r = (await kb.related(`program/${kgSlug}`, {
      edge_type: 'OWN_METAL',
      direction: 'outgoing',
    })) as { items?: Array<{ other: string }> }
    return new Set((r.items ?? []).map((i) => i.other))
  } catch {
    return new Set()
  }
}

export function awardOptionsTool(lookup: AirportLookup, db: SqlStorage, apiKey: string, kb: KbHttp) {
  return tool({
    description:
      'Best award options to fly a city pair on a given card, end to end. Input ' +
      '`programmes` is the card\'s reachable programmes (kg slugs or names). It ' +
      'discovers the routings (nonstop + one-stop), prices EVERY routing × ' +
      'programme through the real charts, flags own-metal vs partner, and returns ' +
      'one ranked list (`options`): directs first, then hops by total distance, ' +
      'own-metal first within a routing. Use this for "best/cheapest award options" ' +
      'questions instead of assembling award_quote calls by hand — it is exhaustive ' +
      'and the miles are real. Each option carries per-cabin [min,max] miles.',
    inputSchema: awardOptionsInputSchema,
    outputSchema: awardOptionsOutputSchema,
    execute: async ({ origin, destination, programmes }): Promise<AwardOptionsResult> => {
      const o = origin.toUpperCase()
      const d = destination.toUpperCase()
      const notes: string[] = []

      let routings: Routing[]
      try {
        routings = await computeRoutings(db, apiKey, o, d)
      } catch (err) {
        return { origin: o, destination: d, options: [], notes: [`route lookup failed: ${String(err)}`] }
      }
      if (routings.length === 0) {
        return { origin: o, destination: d, options: [], notes: ['no direct or one-stop routing found'] }
      }

      // Resolve requested programmes → engine/kg slug, de-duped.
      const slugs = new Set<string>()
      for (const p of programmes) {
        const id = resolveProgrammeId(p)
        if (id) slugs.add(id)
        else notes.push(`unrecognized programme: "${p}"`)
      }

      // Pre-fetch KB facts once: each leg carrier's airline slug, and each
      // programme's own-metal airline slugs.
      const carrierAirline = new Map<string, string | null>()
      const distinctCarriers = new Set<string>()
      for (const r of routings)
        for (const leg of r.legs) for (const c of leg.carriers) if (c.iata) distinctCarriers.add(c.iata)
      await Promise.all(
        [...distinctCarriers].map(async (iata) => carrierAirline.set(iata, await airlineSlugFor(kb, iata))),
      )
      const ownMetal = new Map<string, Set<string>>()
      await Promise.all([...slugs].map(async (s) => ownMetal.set(s, await ownMetalSlugs(kb, s))))

      type Opt = AwardOptionsResult['options'][number]
      const options: Opt[] = []

      for (const routing of routings) {
        for (const slug of slugs) {
          const mod = PROGRAMMES[slug]
          if (!mod) continue
          const metal = ownMetal.get(slug) ?? new Set()

          // Pick a bookable carrier per leg, preferring own metal.
          const chosen: string[] = []
          let bookableAll = true
          for (const leg of routing.legs) {
            const bookable = leg.carriers.filter((c) => c.iata && mod.bookable.has(c.iata))
            if (bookable.length === 0) {
              bookableAll = false
              break
            }
            const own = bookable.find((c) => {
              const slugA = carrierAirline.get(c.iata as string)
              return slugA != null && metal.has(slugA)
            })
            chosen.push((own ?? bookable[0]).iata as string)
          }
          if (!bookableAll) continue

          const legs = routing.legs.map((leg, i) => ({
            origin: leg.origin,
            destination: leg.destination,
            carrier: chosen[i],
          }))
          const priced = priceProgramme(slug, legs, lookup)
          if ('error' in priced || priced.entries.length === 0) continue

          const isOwnMetal = chosen.every((iata) => {
            const slugA = carrierAirline.get(iata)
            return slugA != null && metal.has(slugA)
          })
          const cabins = aggregateCabins(priced.entries)
          options.push({
            hub: routing.hub,
            carriers: chosen,
            total_distance: Math.round(priced.resolved.total_distance),
            programme: slug,
            own_metal: isOwnMetal,
            economy: cabins.economy,
            premium_economy: cabins.premium_economy,
            business: cabins.business,
            first: cabins.first,
          })
        }
      }

      // Rank: directs first → hops by total distance → own-metal first within a
      // routing → cheaper economy as a final tiebreak.
      const eco = (x: Opt) => x.economy?.[0] ?? Number.POSITIVE_INFINITY
      options.sort((a, b) => {
        if ((a.hub === null) !== (b.hub === null)) return a.hub === null ? -1 : 1
        if (a.total_distance !== b.total_distance) return a.total_distance - b.total_distance
        if (a.own_metal !== b.own_metal) return a.own_metal ? -1 : 1
        return eco(a) - eco(b)
      })

      if (options.length > MAX_OPTIONS) {
        notes.push(`showing ${MAX_OPTIONS} of ${options.length} priced options`)
      }
      return { origin: o, destination: d, options: options.slice(0, MAX_OPTIONS), notes }
    },
  })
}
