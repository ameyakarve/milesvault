import { z } from 'zod'
import { PROGRAMMES, priceProgramme } from './award-engine'
import type { AirportLookup, Entry, CabinRange } from './award-engine'
import { computeRoutings, type Routing } from './flight-routings'
import type { KbHttp } from './kb-tools'
import { AWARD, toAward, toCabinCell, type Award } from './award-price'

// "Best award options for this O&D" — the objective fly-side only. Given just
// origin + destination, it finds every nonstop + one-stop routing and prices
// EVERY programme that can actually book each routing, through the real charts.
// It does NOT scope to a card or cost things in the user's points — accumulation
// and transfers live on the /points page (TRANSFERS / EARNS_INTO graph). Keeping
// this tool card-agnostic is what makes it generic. Directs are listed first.

// A cabin cell: a real published [min,max] range, OR the string "dynamic"
// (the programme can book it but publishes no chart/bounds — show "varies,
// confirm live", NEVER a number; this also covers a chart that returned 0, which
// is not a real price), OR null (cabin not offered).
const CABIN = z
  .union([z.tuple([z.number(), z.number()]), z.literal('dynamic'), z.null()])
  .describe(
    '[min,max] published miles, "dynamic" (bookable but no published rate / 0 → show "varies"), or null (not offered).',
  )

const CABIN_SET = z.object({
  economy: CABIN,
  premium_economy: CABIN,
  business: CABIN,
  first: CABIN,
})

const ROUTING = z.object({
  hub: z.string().nullable().describe('Connecting hub IATA, or null for nonstop.'),
  carriers: z.array(z.string()).describe('Operating carrier IATA per leg.'),
  distance: z.number().describe('Great-circle miles for this routing.'),
})

// The canonical shape of a computed result — the `AwardOptionsResult` type is
// inferred from it (and re-used by award-plan / award-explore). Kept as a zod
// schema so the shape stays the single source of truth.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const awardOptionsOutputSchema = z.object({
  origin: z.string(),
  destination: z.string(),
  options: z.array(
    z.object({
      programme: z.string().describe('milesvault-kg programme slug actually priced.'),
      programme_currency: z
        .string()
        .nullable()
        .describe(
          'The currency this programme prices in ("currency/krisflyer-miles") — the funding target.',
        ),
      own_metal: z.boolean().describe('True if every leg flies the programme’s own metal.'),
      stops: z.number().describe('0 = nonstop, 1 = one-stop.'),
      routings: z
        .array(ROUTING)
        .describe('Equivalent routings that price identically (shortest first).'),
      total_distance: z.number().describe('Shortest routing distance.'),
      published: z
        .boolean()
        .describe(
          'False = no published award chart; every cabin is "dynamic" — show "varies, confirm live", never a number.',
        ),
      cabins: CABIN_SET.describe(
        'Per-cabin published [min,max] miles, "dynamic", or null. See `published`. DERIVED from `price` for display — `price` is the source of truth.',
      ),
      price: z
        .object({ economy: AWARD, premium_economy: AWARD, business: AWARD, first: AWARD })
        .describe(
          'Per-cabin award price in the full tier model (source of truth). Each cabin: {status:"not_offered"} or {status:"bookable", price:[tiers]}. `cabins` above is the flattened display view of this.',
        ),
    }),
  ),
  dests: z
    .array(z.string())
    .describe(
      'Distinct programme currencies across all options — feed these to transfer_matrix to scope + cost by a card.',
    ),
  notes: z.array(z.string()),
})

export type AwardOptionsResult = z.infer<typeof awardOptionsOutputSchema>
type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
const CABINS: Cabin[] = ['economy', 'premium_economy', 'business', 'first']
const MAX_OPTIONS = 80

// A published range, "dynamic" (offered but no published rate / a 0 chart
// figure), or null.
type CabinCell = CabinRange | 'dynamic'
// A programme with no published award chart (revenue/dynamic pricing with no
// real floor we can quote). The module declares `export const published = false`;
// when it does, we surface every offered cabin as "dynamic" rather than the
// misleading chart minimum. Default (flag absent) = published/chart-priced.
function isPublished(mod: unknown): boolean {
  return (mod as { published?: boolean }).published !== false
}
// Merge a programme's entries into one per-cabin set. A chart figure of 0 is not
// a real price (the dynamic/phone-only modules emit [0,0] to mean "unpublished"),
// so it collapses to "dynamic" ("varies") rather than a misleading 0 — but a
// real figure for the same cabin always wins.
function aggregateCabins(entries: Entry[]): Record<Cabin, CabinCell> {
  const agg: Record<Cabin, CabinCell> = {
    economy: null,
    premium_economy: null,
    business: null,
    first: null,
  }
  for (const e of entries) {
    for (const c of CABINS) {
      const r = e[c]
      if (!r) continue
      if (r[0] <= 0) {
        if (agg[c] == null) agg[c] = 'dynamic'
        continue
      }
      const cur = agg[c]
      agg[c] = Array.isArray(cur) ? [Math.min(cur[0], r[0]), Math.max(cur[1], r[1])] : [r[0], r[1]]
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

// Pure core: the fly-side computation, no tool wrapper. Reused by both the
// `award_options` agent tool and the read-only award-plan HTTP endpoint (which
// joins this against the transfers graph to cost it in a card's points).
export async function computeAwardOptions(
  db: SqlStorage,
  apiKey: string,
  kb: KbHttp,
  origin: string,
  destination: string,
): Promise<AwardOptionsResult & { lookup: AirportLookup }> {
  const o = origin.toUpperCase()
  const d = destination.toUpperCase()
  const notes: string[] = []

  let routings: Routing[]
  let lookup: AirportLookup
  try {
    ;({ routings, lookup } = await computeRoutings(db, apiKey, kb, o, d))
  } catch (err) {
    return {
      origin: o,
      destination: d,
      options: [],
      dests: [],
      notes: [`route lookup failed: ${String(err)}`],
      lookup: () => null,
    }
  }
  if (routings.length === 0) {
    return {
      origin: o,
      destination: d,
      options: [],
      dests: [],
      notes: ['no direct or one-stop routing found'],
      lookup,
    }
  }

  // Pre-fetch each leg carrier's airline slug once (for own-metal checks).
  const carrierAirline = new Map<string, string | null>()
  const distinctCarriers = new Set<string>()
  for (const r of routings)
    for (const leg of r.legs) for (const c of leg.carriers) if (c.iata) distinctCarriers.add(c.iata)
  await Promise.all(
    [...distinctCarriers].map(async (iata) =>
      carrierAirline.set(iata, await airlineSlugFor(kb, iata)),
    ),
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
    price: Record<Cabin, Award>
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
      // Build the richer tier model (source of truth), then derive the legacy
      // per-cabin cells from it for display. For an unpublished programme every
      // offered cabin becomes a fully-dynamic band (never the chart minimum,
      // which lies low) — that falls out of toAward's !published branch.
      const published = isPublished(mod)
      const agg = aggregateCabins(priced.entries)
      const price: Record<Cabin, Award> = {
        economy: toAward(agg.economy, published),
        premium_economy: toAward(agg.premium_economy, published),
        business: toAward(agg.business, published),
        first: toAward(agg.first, published),
      }
      const cabins: Record<Cabin, CabinCell> = {
        economy: toCabinCell(price.economy),
        premium_economy: toCabinCell(price.premium_economy),
        business: toCabinCell(price.business),
        first: toCabinCell(price.first),
      }
      flat.push({
        programme: slug,
        own_metal: isOwnMetal,
        stops: routing.hub === null ? 0 : 1,
        hub: routing.hub,
        carriers: chosen,
        distance: Math.round(priced.resolved.total_distance),
        published,
        cabins,
        price,
      })
    }
  }

  // `programme_currency` is no longer resolved here — the explorer keys on the
  // programme itself (the /points page handles accumulation/transfers), so this
  // module no longer reads the program→currency DENOMINATED_IN edge. The field
  // stays in the shape (nullable) for compatibility but is left null.
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
        programme_currency: null,
        own_metal: f.own_metal,
        stops: f.stops,
        routings: [],
        total_distance: f.distance,
        published: f.published,
        cabins: {
          economy: c.economy,
          premium_economy: c.premium_economy,
          business: c.business,
          first: c.first,
        },
        // Interchangeable routings in a group share identical cabins (the group
        // key), so their `price` is identical too — take the first.
        price: f.price,
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

  notes.push(`${options.length} fly-options (directs first)`)

  return { origin: o, destination: d, options, dests: [], notes, lookup }
}
