import { tool } from 'ai'
import { z } from 'zod'
import { resolveChart } from './award-charts'
import type { OdRoute } from './award-charts'

const CABINS = ['economy', 'premium', 'business', 'first'] as const
type Cabin = (typeof CABINS)[number]

// the OdRoute column each cabin maps to.
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

const awardQuoteOutputSchema = z.object({
  results: z.array(
    z.object({
      uuid: z.string(),
      miles_total: z
        .number()
        .describe('Total award miles, or -1 if the quote cannot be priced.'),
    }),
  ),
})

type QuoteInput = z.infer<typeof QUOTE>

// Returns total award miles, or -1 if the quote can't be priced (unknown
// program, a leg not on the chart's carrier, an O&D not in the chart, or a
// cabin not offered on some leg).
function priceQuote(q: QuoteInput): number {
  const chart = resolveChart(q.program)
  if (!chart || chart.method !== 'od-table') return -1

  // Air India self awards are additive: each leg is priced as its own
  // one-way O&D at that leg's cabin, and the total is the sum. (Round
  // trips / connections = the caller just lists the legs.) A "self" chart
  // prices only the carrier's own metal, so every leg must be on it.
  let total = 0
  for (const leg of q.legs) {
    if (leg.carrier.trim().toUpperCase() !== chart.carrier) return -1
    const from = leg.from.trim().toUpperCase()
    const to = leg.to.trim().toUpperCase()
    const route = chart.routes[`${from}-${to}`]
    if (!route) return -1
    const miles = route[CABIN_COL[leg.cabin]]
    if (typeof miles !== 'number') return -1
    total += miles
  }
  return total
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
      '`{ uuid, miles_total }`, where `miles_total` is -1 if the quote ' +
      'cannot be priced. Currently only Air India own-metal awards are charted.',
    inputSchema: awardQuoteInputSchema,
    outputSchema: awardQuoteOutputSchema,
    execute: async ({ quotes }) => {
      return {
        results: quotes.map((q) => {
          try {
            return { uuid: q.uuid, miles_total: priceQuote(q) }
          } catch {
            return { uuid: q.uuid, miles_total: -1 }
          }
        }),
      }
    },
  })
}
