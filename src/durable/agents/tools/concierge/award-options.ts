import { tool } from 'ai'
import { z } from 'zod'
import { PROGRAMMES, priceProgramme } from './award-engine'
import type { AirportLookup, Entry, CabinRange } from './award-engine'
import { computeRoutings, type Routing } from './flight-routings'
import type { KbHttp } from './kb-tools'

// "Best award options for this O&D" — the objective fly-side only. Given just
// origin + destination, it finds every nonstop + one-stop routing and prices
// EVERY programme that can actually book each routing, through the real charts.
// It does NOT scope to a card or cost things in the user's points — that is the
// agent's job: it walks the card's TRANSFERS_TO partners (via transfer_matrix),
// drops programmes the card can't reach, and costs the rest. Keeping this tool
// card-agnostic is what makes it generic. Directs are listed first.

// A cabin cell: a real published [min,max] range, OR the string "dynamic"
// (the programme can book it but publishes no chart/bounds — show "varies,
// confirm live", NEVER a number; a floor here would mislead), OR null (cabin
// not offered).
const CABIN = z
  .union([z.tuple([z.number(), z.number()]), z.literal('dynamic'), z.null()])
  .describe('[min,max] published miles, "dynamic" (bookable but no published rate → show "varies"), or null (not offered).')

const CABIN_SET = z.object({
  economy: CABIN,
  premium_economy: CABIN,
  business: CABIN,
  first: CABIN,
})

const awardOptionsInputSchema = z.object({
  origin: z.string().describe('Origin airport IATA, e.g. "BLR".'),
  destination: z.string().describe('Destination airport IATA, e.g. "NRT".'),
})

const ROUTING = z.object({
  hub: z.string().nullable().describe('Connecting hub IATA, or null for nonstop.'),
  carriers: z.array(z.string()).describe('Operating carrier IATA per leg.'),
  distance: z.number().describe('Great-circle miles for this routing.'),
})

const awardOptionsOutputSchema = z.object({
  origin: z.string(),
  destination: z.string(),
  options: z.array(
    z.object({
      programme: z.string().describe('milesvault-kg programme slug actually priced.'),
      programme_currency: z
        .string()
        .nullable()
        .describe('The currency this programme prices in ("currency/krisflyer-miles") — the funding target.'),
      own_metal: z.boolean().describe('True if every leg flies the programme’s own metal.'),
      stops: z.number().describe('0 = nonstop, 1 = one-stop.'),
      routings: z.array(ROUTING).describe('Equivalent routings that price identically (shortest first).'),
      total_distance: z.number().describe('Shortest routing distance.'),
      published: z
        .boolean()
        .describe('False = no published award chart; every cabin is "dynamic" — show "varies, confirm live", never a number.'),
      cabins: CABIN_SET.describe('Per-cabin published [min,max] miles, "dynamic", or null. See `published`.'),
    }),
  ),
  dests: z
    .array(z.string())
    .describe('Distinct programme currencies across all options — feed these to transfer_matrix to scope + cost by a card.'),
  notes: z.array(z.string()),
})

type AwardOptionsResult = z.infer<typeof awardOptionsOutputSchema>
type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
const CABINS: Cabin[] = ['economy', 'premium_economy', 'business', 'first']
const MAX_OPTIONS = 80

// A published range, "dynamic" (offered but no published rate), or null.
type CabinCell = CabinRange | 'dynamic'
// A programme with no published award chart (revenue/dynamic pricing with no
// real floor we can quote). The module declares `export const published = false`;
// when it does, we surface every offered cabin as "dynamic" rather than the
// misleading chart minimum. Default (flag absent) = published/chart-priced.
function isPublished(mod: unknown): boolean {
  return (mod as { published?: boolean }).published !== false
}
// Offered cabins → "dynamic" for an unpublished programme; null stays null.
function asDynamic(cabins: Record<Cabin, CabinRange>): Record<Cabin, CabinCell> {
  return {
    economy: cabins.economy ? 'dynamic' : null,
    premium_economy: cabins.premium_economy ? 'dynamic' : null,
    business: cabins.business ? 'dynamic' : null,
    first: cabins.first ? 'dynamic' : null,
  }
}

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
    const r = (await kb.resolve(iata, { prefix: 'airline' })) as { items?: Array<{ slug: string }> }
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

// A programme's underlying currency: program/<slug> --DENOMINATED_IN--> currency.
// This is the funding target the agent transfers INTO.
async function currencyOfProgramme(kb: KbHttp, kgSlug: string): Promise<string | null> {
  try {
    const r = (await kb.related(`program/${kgSlug}`, {
      edge_type: 'DENOMINATED_IN',
      direction: 'outgoing',
    })) as { items?: Array<{ other: string }> }
    return r.items?.find((i) => i.other.startsWith('currency/'))?.other ?? null
  } catch {
    return null
  }
}

export function awardOptionsTool(lookup: AirportLookup, db: SqlStorage, apiKey: string, kb: KbHttp) {
  return tool({
    description:
      'Exhaustive award options to fly a city pair — the fly-side only. Give origin + ' +
      'destination; it discovers every nonstop and one-stop routing, prices EVERY programme ' +
      'that can actually book each leg through the real charts, and returns one list of ' +
      'fly-options (per-cabin miles, own-metal vs partner, collapsed equivalent routings) with ' +
      "each option's funding currency (`programme_currency`). Directs are listed first. It does " +
      "NOT scope to a card: to answer \"with <card>\", feed `dests` + the card's currency into " +
      'transfer_matrix, drop the unreachable (-1) programmes, and cost the rest (miles × ratio).',
    inputSchema: awardOptionsInputSchema,
    outputSchema: awardOptionsOutputSchema,
    execute: async ({ origin, destination }): Promise<AwardOptionsResult> => {
      const o = origin.toUpperCase()
      const d = destination.toUpperCase()
      const notes: string[] = []

      let routings: Routing[]
      try {
        routings = await computeRoutings(db, apiKey, o, d)
      } catch (err) {
        return { origin: o, destination: d, options: [], dests: [], notes: [`route lookup failed: ${String(err)}`] }
      }
      if (routings.length === 0) {
        return { origin: o, destination: d, options: [], dests: [], notes: ['no direct or one-stop routing found'] }
      }

      // Pre-fetch each leg carrier's airline slug once (for own-metal checks).
      const carrierAirline = new Map<string, string | null>()
      const distinctCarriers = new Set<string>()
      for (const r of routings)
        for (const leg of r.legs) for (const c of leg.carriers) if (c.iata) distinctCarriers.add(c.iata)
      await Promise.all(
        [...distinctCarriers].map(async (iata) => carrierAirline.set(iata, await airlineSlugFor(kb, iata))),
      )

      type Flat = {
        programme: string
        own_metal: boolean
        stops: number
        hub: string | null
        carriers: string[]
        distance: number
        published: boolean
        cabins: Record<Cabin, CabinCell>
      }
      const flat: Flat[] = []
      const ownMetalCache = new Map<string, Set<string>>()

      for (const routing of routings) {
        // EVERY programme the engine knows — canBook (inside priceProgramme)
        // filters to those that can actually book this routing's carriers.
        for (const slug of Object.keys(PROGRAMMES)) {
          const mod = PROGRAMMES[slug]
          let metal = ownMetalCache.get(slug)
          if (!metal) {
            metal = await ownMetalSlugs(kb, slug)
            ownMetalCache.set(slug, metal)
          }

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
              return slugA != null && metal!.has(slugA)
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
            return slugA != null && metal!.has(slugA)
          })
          // Unpublished programmes: keep the option (it IS bookable) but surface
          // its cabins as "dynamic", never the chart minimum (which lies low).
          const published = isPublished(mod)
          const agg = aggregateCabins(priced.entries)
          flat.push({
            programme: slug,
            own_metal: isOwnMetal,
            stops: routing.hub === null ? 0 : 1,
            hub: routing.hub,
            carriers: chosen,
            distance: Math.round(priced.resolved.total_distance),
            published,
            cabins: published ? agg : asDynamic(agg),
          })
        }
      }

      // Resolve each distinct priced programme to its currency (the funding target).
      const distinctProgs = [...new Set(flat.map((f) => f.programme))]
      const progCurrency = new Map<string, string | null>()
      await Promise.all(
        distinctProgs.map(async (p) => progCurrency.set(p, await currencyOfProgramme(kb, p))),
      )

      type Opt = AwardOptionsResult['options'][number]
      // Collapse interchangeable routings: same programme, stop count, metal,
      // identical cabin pricing → one option listing the equivalent hubs.
      const groups = new Map<string, Opt>()
      for (const f of flat) {
        const c = f.cabins
        const key = `${f.programme}|${f.stops}|${f.own_metal}|${f.published}|${JSON.stringify([
          c.economy,
          c.premium_economy,
          c.business,
          c.first,
        ])}`
        let g = groups.get(key)
        if (!g) {
          g = {
            programme: f.programme,
            programme_currency: progCurrency.get(f.programme) ?? null,
            own_metal: f.own_metal,
            stops: f.stops,
            routings: [],
            total_distance: f.distance,
            published: f.published,
            cabins: { economy: c.economy, premium_economy: c.premium_economy, business: c.business, first: c.first },
          }
          groups.set(key, g)
        }
        g.routings.push({ hub: f.hub, carriers: f.carriers, distance: f.distance })
        g.total_distance = Math.min(g.total_distance, f.distance)
      }
      let options = [...groups.values()]
      for (const g of options) g.routings.sort((a, b) => a.distance - b.distance)

      // ALL direct flights first, then connections; within each, shorter
      // distance, then own-metal, then a stable programme order.
      options.sort((a, b) => {
        if (a.stops !== b.stops) return a.stops - b.stops
        if (a.total_distance !== b.total_distance) return a.total_distance - b.total_distance
        if (a.own_metal !== b.own_metal) return a.own_metal ? -1 : 1
        return a.programme.localeCompare(b.programme)
      })
      if (options.length > MAX_OPTIONS) {
        notes.push(`showing ${MAX_OPTIONS} of ${options.length} options`)
        options = options.slice(0, MAX_OPTIONS)
      }

      const dests = [...new Set(options.map((o2) => o2.programme_currency).filter((c): c is string => !!c))]
      notes.push(`${options.length} fly-options across ${dests.length} programme currencies (directs first)`)

      return { origin: o, destination: d, options, dests, notes }
    },
  })
}
