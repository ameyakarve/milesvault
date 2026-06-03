import { tool } from 'ai'
import { z } from 'zod'
import { priceProgramme, resolveProgrammeId } from './award-engine'
import type { AirportLookup, CabinRange, Entry } from './award-engine'

const CABINS = ['economy', 'premium', 'business', 'first'] as const
type Cabin = (typeof CABINS)[number]

const LEG = z.object({
  origin: z.string().describe('Origin airport IATA code, e.g. "BOM".'),
  destination: z.string().describe('Destination airport IATA code, e.g. "DEL".'),
  cabin: z.enum(CABINS),
  carrier: z.string().describe('Operating carrier IATA code, e.g. "AI".'),
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

// Minimal output, three outcomes:
//   priced       → { uuid, miles_total }   (>= 0)
//   not priceable → { uuid, miles_total: -1 }
//   needs input  → { uuid, clarification }  (a short question for the user)
const awardQuoteOutputSchema = z.object({
  results: z.array(
    z.union([
      z.object({ uuid: z.string(), miles_total: z.number() }),
      z.object({ uuid: z.string(), clarification: z.string() }),
    ]),
  ),
})

type QuoteInput = z.infer<typeof QUOTE>
type QuoteResult =
  | { uuid: string; miles_total: number }
  | { uuid: string; clarification: string }

// The Entry field for a requested cabin.
function cabinRange(entry: Entry, cabin: Cabin): CabinRange {
  if (cabin === 'premium') return entry.premium_economy
  return entry[cabin]
}

function priceQuote(q: QuoteInput, lookup: AirportLookup): QuoteResult {
  const id = resolveProgrammeId(q.program)
  if (!id) return { uuid: q.uuid, miles_total: -1 }

  // Whole-itinerary pricing is per-cabin; require a single cabin. Mixed
  // cabins is the canonical "need more input" case.
  const cabins = [...new Set(q.legs.map((l) => l.cabin))]
  if (cabins.length > 1) {
    return {
      uuid: q.uuid,
      clarification: `Mixed cabins (${cabins.join(', ')}) — quote one cabin per itinerary.`,
    }
  }
  const cabin = cabins[0]

  const priced = priceProgramme(
    id,
    q.legs.map((l) => ({ origin: l.origin, destination: l.destination, carrier: l.carrier })),
    lookup,
  )
  if ('error' in priced) return { uuid: q.uuid, miles_total: -1 }

  // Collect this cabin's lower bound across every returned scenario
  // (chart × season). Distinct mins → genuine fork → ask the user.
  const scenarios: { label: string; min: number }[] = []
  for (const e of priced.entries) {
    const range = cabinRange(e, cabin)
    if (!range) continue
    scenarios.push({ label: `${e.chart}/${e.season}`, min: range[0] })
  }
  if (scenarios.length === 0) return { uuid: q.uuid, miles_total: -1 }

  const distinct = [...new Set(scenarios.map((s) => s.min))]
  if (distinct.length === 1) return { uuid: q.uuid, miles_total: distinct[0] }

  // Multiple different prices (e.g. peak vs off-peak, own vs partner).
  const opts = scenarios
    .map((s) => `${s.label}: ${s.min.toLocaleString()}`)
    .join('; ')
  return {
    uuid: q.uuid,
    clarification: `${cabin} price depends on chart/season — ${opts}. Which applies?`,
  }
}

// Server tool: batch award pricing across the bundled programme engine.
// Airports resolve against the ConciergeDO SQLite (injected `lookup`).
export function awardQuoteTool(lookup: AirportLookup) {
  return tool({
    description:
      'Batch award-flight pricing across ~45 frequent-flyer programmes. ' +
      'Input `quotes`: each has a `uuid`, a `program` (FFP whose miles you ' +
      'spend — e.g. "air india", "krisflyer", "avios"), and ordered one-way ' +
      '`legs` ({ origin, destination } IATA, `carrier` IATA, `cabin` of ' +
      'economy|premium|business|first; one cabin per itinerary). Returns ' +
      '`results` 1:1 by `uuid`: `{ uuid, miles_total }` (miles, or -1 if not ' +
      'priceable), or `{ uuid, clarification }` when a single number needs a ' +
      'user choice (e.g. peak vs off-peak).',
    inputSchema: awardQuoteInputSchema,
    outputSchema: awardQuoteOutputSchema,
    execute: async ({ quotes }) => {
      return {
        results: quotes.map((q) => {
          try {
            return priceQuote(q, lookup)
          } catch {
            return { uuid: q.uuid, miles_total: -1 }
          }
        }),
      }
    },
  })
}
