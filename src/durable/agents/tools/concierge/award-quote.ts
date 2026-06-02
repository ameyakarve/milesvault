import { tool } from 'ai'
import { z } from 'zod'
import { resolveChart } from './award-charts'
import type { OdRoute } from './award-charts'

const CABINS = ['economy', 'premium', 'business', 'first'] as const
type Cabin = (typeof CABINS)[number]

// cabin rank (low→high) and the OdRoute column each maps to.
const CABIN_RANK: Record<Cabin, number> = {
  economy: 0,
  premium: 1,
  business: 2,
  first: 3,
}
const CABIN_COL: Record<Cabin, keyof OdRoute> = {
  economy: 'e',
  premium: 'p',
  business: 'b',
  first: 'f',
}

const LEG = z.object({
  from: z.string().describe('Origin airport IATA code, e.g. "BOM".'),
  to: z.string().describe('Destination airport IATA code, e.g. "DEL".'),
  cabin: z.enum(CABINS),
  carrier: z.string().describe('Operating carrier IATA code, e.g. "AI".'),
})

const QUOTE = z.object({
  uuid: z
    .string()
    .describe('Caller-supplied id; echoed verbatim in the matching result.'),
  program: z
    .string()
    .describe('FFP whose miles are spent, e.g. "air india" / "maharaja club".'),
  legs: z.array(LEG).min(1).describe('Ordered flight legs.'),
})

export const awardQuoteInputSchema = z.object({
  quotes: z.array(QUOTE).min(1),
})

const RESULT = z.union([
  z.object({ uuid: z.string(), ok: z.literal(true), miles_total: z.number() }),
  z.object({ uuid: z.string(), ok: z.literal(false), error: z.string() }),
])

const awardQuoteOutputSchema = z.object({ results: z.array(RESULT) })

type QuoteInput = z.infer<typeof QUOTE>

function priceQuote(q: QuoteInput): number | { error: string } {
  const chart = resolveChart(q.program)
  if (!chart) return { error: 'no_chart_for_program' }
  if (chart.method !== 'od-table') return { error: 'unsupported_method' }

  // A "self" chart prices only the carrier's own metal — every leg must
  // be on that carrier.
  for (const leg of q.legs) {
    if (leg.carrier.trim().toUpperCase() !== chart.carrier) {
      return { error: 'route_not_on_carrier' }
    }
  }

  // O&D = first origin → last destination; intermediate routing is free.
  const from = q.legs[0].from.trim().toUpperCase()
  const to = q.legs[q.legs.length - 1].to.trim().toUpperCase()
  const route = chart.routes[`${from}-${to}`]
  if (!route) return { error: 'no_route' }

  // Price at the highest cabin flown on any leg.
  const cabin = q.legs.reduce<Cabin>(
    (hi, leg) => (CABIN_RANK[leg.cabin] > CABIN_RANK[hi] ? leg.cabin : hi),
    'economy',
  )
  const miles = route[CABIN_COL[cabin]]
  if (typeof miles !== 'number') return { error: 'cabin_unavailable' }
  return miles
}

// Server tool: batch award-chart pricing. Each quote is a program + ordered
// legs (IATA airports/carrier/cabin); the result carries `miles_total`,
// correlated by the caller's `uuid`. Charts are bundled data (no KG round
// trip). First chart: Air India self (od-table, O&D direct lookup).
export function awardQuoteTool() {
  return tool({
    description:
      'Batch award-chart pricing. Input `quotes`: each has a `uuid`, a ' +
      '`program` (FFP whose miles you spend — e.g. "air india"), and ordered ' +
      '`legs` ({ from, to } IATA airports, `carrier` IATA code, `cabin` of ' +
      'economy|premium|business|first). Returns `results` 1:1 by `uuid`: ' +
      '`{ uuid, ok:true, miles_total }` or `{ uuid, ok:false, error }`. ' +
      'Currently only Air India own-metal awards are charted.',
    inputSchema: awardQuoteInputSchema,
    outputSchema: awardQuoteOutputSchema,
    execute: async ({ quotes }) => {
      return {
        results: quotes.map((q) => {
          try {
            const priced = priceQuote(q)
            return typeof priced === 'number'
              ? { uuid: q.uuid, ok: true as const, miles_total: priced }
              : { uuid: q.uuid, ok: false as const, error: priced.error }
          } catch {
            return { uuid: q.uuid, ok: false as const, error: 'internal' }
          }
        }),
      }
    },
  })
}
