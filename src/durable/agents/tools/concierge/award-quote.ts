import { tool } from 'ai'
import { z } from 'zod'
import { priceProgramme, resolveProgrammeId } from './award-engine'
import type { AirportLookup, CabinRange, Entry } from './award-engine'

const CABINS = ['economy', 'premium', 'business', 'first'] as const
type Cabin = (typeof CABINS)[number]

const CABIN_RANK: Record<Cabin, number> = {
  economy: 0,
  premium: 1,
  business: 2,
  first: 3,
}

const LEG = z.object({
  origin: z.string().describe('Origin airport IATA code, e.g. "BLR".'),
  destination: z.string().describe('Destination airport IATA code, e.g. "NRT".'),
  cabin: z.enum(CABINS),
  carrier: z.string().describe('Operating carrier IATA code, e.g. "NH".'),
})

const QUOTE = z.object({
  uuid: z
    .string()
    .describe('Caller-supplied id; echoed verbatim in the matching result.'),
  program: z
    .string()
    .describe('FFP whose miles are spent, e.g. "air india" / "krisflyer".'),
  legs: z.array(LEG).min(1).describe('Ordered flight legs (one-way).'),
})

export const awardQuoteInputSchema = z.object({
  quotes: z.array(QUOTE).min(1),
})

// One freeform line per quote: the award miles for the itinerary, with
// peak/off-peak and own/partner rates spelled out inline where they differ.
const awardQuoteOutputSchema = z.object({
  results: z.array(z.object({ uuid: z.string(), text: z.string() })),
})

type QuoteInput = z.infer<typeof QUOTE>

function cabinRange(entry: Entry, cabin: Cabin): CabinRange {
  if (cabin === 'premium') return entry.premium_economy
  return entry[cabin]
}

const fmt = (n: number) => n.toLocaleString('en-US')
const range = (r: [number, number]) => (r[0] === r[1] ? fmt(r[0]) : `${fmt(r[0])}–${fmt(r[1])}`)

function quoteText(q: QuoteInput, lookup: AirportLookup): string {
  const id = resolveProgrammeId(q.program)
  if (!id) return `no award chart for "${q.program}"`

  // Whole-itinerary pricing is per-cabin; use the highest cabin flown.
  const cabin = q.legs.reduce<Cabin>(
    (hi, l) => (CABIN_RANK[l.cabin] > CABIN_RANK[hi] ? l.cabin : hi),
    'economy',
  )

  const priced = priceProgramme(
    id,
    q.legs.map((l) => ({ origin: l.origin, destination: l.destination, carrier: l.carrier })),
    lookup,
  )
  if ('error' in priced) {
    return priced.error.startsWith('unknown_airport')
      ? `unknown airport (${priced.error.split(': ')[1] ?? ''})`
      : 'not priceable'
  }

  const entries = priced.entries.filter((e) => cabinRange(e, cabin))
  if (entries.length === 0) return `${cabin}: not available on this programme`

  const multiChart = new Set(entries.map((e) => e.chart)).size > 1
  const parts = entries.map((e) => {
    const val = range(cabinRange(e, cabin) as [number, number])
    const label = [
      multiChart ? e.chart : '',
      e.season && e.season !== 'default' ? e.season : '',
    ]
      .filter(Boolean)
      .join(' ')
    return label ? `${label} ${val}` : val
  })
  const uniq = [...new Set(parts)]
  return `${cabin}: ${uniq.join(' / ')} miles`
}

// Server tool: batch award-flight pricing across the bundled ~45-programme
// engine. Airports resolve against the ConciergeDO SQLite (injected lookup).
export function awardQuoteTool(lookup: AirportLookup) {
  return tool({
    description:
      'Batch award-flight pricing across ~45 frequent-flyer programmes. ' +
      'Input `quotes`: each has a `uuid`, a `program` (FFP whose miles you ' +
      'spend — e.g. "air india", "krisflyer", "avios"), and ordered one-way ' +
      '`legs` ({ origin, destination } IATA, `carrier` IATA, `cabin` of ' +
      'economy|premium|business|first). Takes no date. Returns `results` 1:1 ' +
      'by `uuid`: `{ uuid, text }`, where `text` is the award miles for the ' +
      'itinerary — with peak/off-peak and own/partner rates spelled out ' +
      'inline where they differ, or a short reason if not priceable.',
    inputSchema: awardQuoteInputSchema,
    outputSchema: awardQuoteOutputSchema,
    execute: async ({ quotes }) => {
      return {
        results: quotes.map((q) => {
          try {
            return { uuid: q.uuid, text: quoteText(q, lookup) }
          } catch {
            return { uuid: q.uuid, text: 'not priceable' }
          }
        }),
      }
    },
  })
}
