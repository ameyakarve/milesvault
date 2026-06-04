import { tool } from 'ai'
import { z } from 'zod'
import { PROGRAMMES, priceProgramme } from './award-engine'
import type { AirportLookup, Entry, CabinRange } from './award-engine'
import { computeRoutings, type Routing } from './flight-routings'
import type { KbHttp } from './kb-tools'
import { transferGraph, resolveCurrency, type TransferCell } from './transfer-graph'
import type { AwardReranker, RerankItem } from './award-rerank'

// "Best award options for this O&D" — the objective half. Given only origin +
// destination, it finds the routings (nonstop + one-stop) and prices EVERY
// programme that can actually book each routing, through the real charts. The
// result is the complete, deterministic fly-side: who flies it, how, and what
// the programme's chart charges per cabin — plus each option's destination
// currency, so the pay-side (funding from the user's points) can be layered on
// in the rerank step. No hint inputs here; prioritisation happens downstream.

const CABIN = z
  .tuple([z.number(), z.number()])
  .nullable()
  .describe('[min, max] miles the programme charts charge for the cabin, or null if not offered.')

const CABIN_SET = z.object({
  economy: CABIN,
  premium_economy: CABIN,
  business: CABIN,
  first: CABIN,
})

const awardOptionsInputSchema = z.object({
  origin: z.string().describe('Origin airport IATA, e.g. "BLR".'),
  destination: z.string().describe('Destination airport IATA, e.g. "NRT".'),
  intent: z
    .string()
    .optional()
    .describe(
      'Free-text of what the user wants — cabin, points they want to use, ' +
        'preferences ("business if close", "use my Amex"). Used to prioritise; ' +
        'never narrows the exhaustive search.',
    ),
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
      cabins: CABIN_SET.describe('Per-cabin [min,max] miles the programme charges.'),
      funding: z
        .object({
          source: z.string().describe('Held currency funding it most cheaply.'),
          multiplier: z.number().describe('Source points per 1 destination point.'),
          hops: z.number().describe('Transfer hops (1 = direct).'),
          cost: CABIN_SET.describe('Per-cabin [min,max] cost in the source currency (card points).'),
        })
        .nullable()
        .describe("Cheapest way to pay from the user's holdings, or null if not fundable from what they hold."),
      why: z.string().nullable().describe('One-line reason for this option’s rank (from the rerank), or null.'),
    }),
  ),
  dests: z
    .array(z.string())
    .describe('Distinct programme currencies across all options — the funding targets for a transfer_matrix lookup.'),
  holdings: z
    .array(z.string())
    .describe("Currencies the user's ledger accounts hold (raw commodity codes) — context for prioritising; may not map 1:1 to KG slugs."),
  notes: z.array(z.string()),
})

type AwardOptionsResult = z.infer<typeof awardOptionsOutputSchema>
type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
const CABINS: Cabin[] = ['economy', 'premium_economy', 'business', 'first']
const MAX_OPTIONS = 80

type Snapshot = { accounts?: Array<{ currencies?: string[] }> }

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
// This is the funding target the pay-side transfers INTO.
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

// Internal working shape — uses the engine's strict CabinRange ([min,max]|null)
// rather than the loose zod-inferred tuple, so the cost/rerank helpers type
// cleanly. Structurally assignable to the zod output type on return.
type OptionT = {
  programme: string
  programme_currency: string | null
  own_metal: boolean
  stops: number
  routings: Array<{ hub: string | null; carriers: string[]; distance: number }>
  total_distance: number
  cabins: Record<Cabin, CabinRange>
  funding: { source: string; multiplier: number; hops: number; cost: Record<Cabin, CabinRange> } | null
  why: string | null
}

function routingSummary(opt: OptionT): string {
  const carriers = opt.routings[0]?.carriers.join('·') ?? ''
  if (opt.stops === 0) return `Direct (${carriers})`
  const hubs = [...new Set(opt.routings.map((r) => r.hub).filter(Boolean))].join(' / ')
  return `1-stop via ${hubs} (${carriers})`
}

export function awardOptionsTool(
  lookup: AirportLookup,
  db: SqlStorage,
  apiKey: string,
  kb: KbHttp,
  getSnapshot: () => Promise<Snapshot>,
  rerank?: AwardReranker,
) {
  return tool({
    description:
      'Exhaustive award options to fly a city pair. Give just origin + destination (+ optional ' +
      'free-text `intent`). It discovers every nonstop and one-stop routing, prices EVERY ' +
      'programme that can actually book each leg through the real charts, and returns one list of ' +
      'fly-options with per-cabin miles, own-metal vs partner, the collapsed equivalent routings, ' +
      "and each option's funding currency (`programme_currency`). To cost it on the user's points, " +
      'feed `dests` + the held currencies into `transfer_matrix`. The search is never narrowed by ' +
      'who is asking — `intent` only prioritises downstream.',
    inputSchema: awardOptionsInputSchema,
    outputSchema: awardOptionsOutputSchema,
    execute: async ({ origin, destination, intent }): Promise<AwardOptionsResult> => {
      const o = origin.toUpperCase()
      const d = destination.toUpperCase()
      const notes: string[] = []

      // Held currencies (raw commodity codes) — wired in as context for the
      // downstream rerank; not parsed deterministically (ledger commodities
      // don't map 1:1 to KG currency slugs).
      let holdings: string[] = []
      try {
        const snap = await getSnapshot()
        holdings = [...new Set((snap.accounts ?? []).flatMap((a) => a.currencies ?? []))]
      } catch {
        // snapshot is best-effort context; ignore failures
      }

      let routings: Routing[]
      try {
        routings = await computeRoutings(db, apiKey, o, d)
      } catch (err) {
        return { origin: o, destination: d, options: [], dests: [], holdings, notes: [`route lookup failed: ${String(err)}`] }
      }
      if (routings.length === 0) {
        return { origin: o, destination: d, options: [], dests: [], holdings, notes: ['no direct or one-stop routing found'] }
      }

      // Pre-fetch each leg carrier's airline slug once (for own-metal checks).
      const carrierAirline = new Map<string, string | null>()
      const distinctCarriers = new Set<string>()
      for (const r of routings)
        for (const leg of r.legs) for (const c of leg.carriers) if (c.iata) distinctCarriers.add(c.iata)
      await Promise.all(
        [...distinctCarriers].map(async (iata) => carrierAirline.set(iata, await airlineSlugFor(kb, iata))),
      )

      type Opt = OptionT
      type Flat = {
        programme: string
        own_metal: boolean
        stops: number
        hub: string | null
        carriers: string[]
        distance: number
        cabins: Record<Cabin, CabinRange>
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
          flat.push({
            programme: slug,
            own_metal: isOwnMetal,
            stops: routing.hub === null ? 0 : 1,
            hub: routing.hub,
            carriers: chosen,
            distance: Math.round(priced.resolved.total_distance),
            cabins: aggregateCabins(priced.entries),
          })
        }
      }

      // Resolve each distinct priced programme to its currency (the funding
      // target) once.
      const distinctProgs = [...new Set(flat.map((f) => f.programme))]
      const progCurrency = new Map<string, string | null>()
      await Promise.all(
        distinctProgs.map(async (p) => progCurrency.set(p, await currencyOfProgramme(kb, p))),
      )

      // Collapse interchangeable routings: same programme, stop count, metal,
      // identical cabin pricing → one option listing the equivalent hubs.
      const groups = new Map<string, Opt>()
      for (const f of flat) {
        const c = f.cabins
        const key = `${f.programme}|${f.stops}|${f.own_metal}|${JSON.stringify([
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
            cabins: { economy: c.economy, premium_economy: c.premium_economy, business: c.business, first: c.first },
            funding: null,
            why: null,
          }
          groups.set(key, g)
        }
        g.routings.push({ hub: f.hub, carriers: f.carriers, distance: f.distance })
        g.total_distance = Math.min(g.total_distance, f.distance)
      }
      let options = [...groups.values()]
      for (const g of options) g.routings.sort((a, b) => a.distance - b.distance)

      // Default objective order: nonstop first, then by distance, own-metal
      // first. The rerank step reorders this for the user; this is the fallback.
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
      notes.push(`${options.length} fly-options across ${dests.length} programme currencies`)

      // ---- pay-side: fund each option from the user's holdings ----
      // Resolve the (raw) held commodity codes to KG currency slugs best-effort,
      // then cost each option's destination currency from the cheapest source.
      const sources = [
        ...new Set(
          (
            await Promise.all(
              holdings.map((h) => resolveCurrency(kb, h).catch((): string | null => null)),
            )
          ).filter((s): s is string => !!s),
        ),
      ]
      let fundingCells: (TransferCell | null)[][] = []
      if (sources.length && dests.length) {
        try {
          fundingCells = await transferGraph(kb, sources, dests)
        } catch {
          fundingCells = []
        }
      }
      const destIdx = new Map(dests.map((c, i) => [c, i]))
      const costCabin = (range: CabinRange, cell: TransferCell): CabinRange => {
        if (!range) return null
        const f = (m: number): number =>
          cell.ratio_source != null && cell.ratio_dest != null
            ? Math.ceil(m / cell.ratio_dest) * cell.ratio_source
            : Math.round(m * cell.multiplier)
        return [f(range[0]), f(range[1])]
      }
      for (const opt of options) {
        const j = opt.programme_currency != null ? destIdx.get(opt.programme_currency) : undefined
        let best: { source: string; cell: TransferCell } | null = null
        if (j != null) {
          for (let i = 0; i < sources.length; i++) {
            const cell = fundingCells[i]?.[j]
            if (cell && (!best || cell.multiplier < best.cell.multiplier)) best = { source: sources[i], cell }
          }
        }
        opt.funding = best
          ? {
              source: best.source,
              multiplier: best.cell.multiplier,
              hops: best.cell.hops,
              cost: {
                economy: costCabin(opt.cabins.economy, best.cell),
                premium_economy: costCabin(opt.cabins.premium_economy, best.cell),
                business: costCabin(opt.cabins.business, best.cell),
                first: costCabin(opt.cabins.first, best.cell),
              },
            }
          : null
      }

      // ---- rerank: Gemma orders for the user; deterministic order is the fallback ----
      if (rerank && options.length > 1 && (intent || sources.length > 0)) {
        const items: RerankItem[] = options.map((o2, i) => ({
          id: `o${i}`,
          programme: o2.programme,
          currency: o2.programme_currency,
          stops: o2.stops,
          own_metal: o2.own_metal,
          routing: routingSummary(o2),
          cabins: o2.cabins,
          funding: o2.funding,
        }))
        const ranked = await rerank({ origin: o, destination: d, intent, holdings, items })
        if (ranked && ranked.length) {
          const seen = new Set<number>()
          const reordered: typeof options = []
          for (const r of ranked) {
            const idx = Number(r.id.replace(/^o/, ''))
            if (!Number.isInteger(idx) || idx < 0 || idx >= options.length || seen.has(idx)) continue
            seen.add(idx)
            options[idx].why = r.why ?? null
            reordered.push(options[idx])
          }
          for (let i = 0; i < options.length; i++) if (!seen.has(i)) reordered.push(options[i])
          options = reordered
          notes.push('reranked for intent / holdings')
        } else {
          notes.push('rerank unavailable — default order')
        }
      }

      return { origin: o, destination: d, options, dests, holdings, notes }
    },
  })
}
