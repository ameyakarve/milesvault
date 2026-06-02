import { tool } from 'ai'
import { z } from 'zod'

const CABINS = ['economy', 'premium', 'business', 'first'] as const

const LEG = z.object({
  from: z.string().describe('Origin airport IATA code, e.g. "BOM".'),
  to: z.string().describe('Destination airport IATA code, e.g. "DOH".'),
  cabin: z.enum(CABINS),
  carrier: z.string().describe('Operating carrier IATA code, e.g. "QR".'),
})

const QUOTE = z.object({
  uuid: z
    .string()
    .describe('Caller-supplied id; echoed verbatim in the matching result.'),
  program: z
    .string()
    .describe('FFP whose miles are spent (slug or name; resolved via kb).'),
  legs: z.array(LEG).min(1).describe('Ordered flight legs.'),
})

export const awardQuoteInputSchema = z.object({
  quotes: z.array(QUOTE).min(1),
})

const RESULT = z.union([
  z.object({
    uuid: z.string(),
    ok: z.literal(true),
    miles_total: z.number(),
  }),
  z.object({
    uuid: z.string(),
    ok: z.literal(false),
    error: z.string(),
  }),
])

const awardQuoteOutputSchema = z.object({
  results: z.array(RESULT),
})

// Server tool: batch award-chart pricing. Each quote is a program + ordered
// legs (IATA airports/carrier/cabin); the result carries `miles_total` per
// quote, correlated by the caller's `uuid`.
//
// STUB: chart lookup is not yet implemented. Returns `not_implemented` for
// every quote so the contract (input/output schema) is fixed while the real
// distance/zone pricing logic is built behind it.
export function awardQuoteTool() {
  return tool({
    description:
      'Batch award-chart pricing. Input `quotes`: each has a `uuid`, a ' +
      '`program` (FFP whose miles you spend), and ordered `legs` ' +
      '({ from, to } IATA airports, `carrier` IATA code, `cabin`). Returns ' +
      '`results` 1:1, each `{ uuid, ok, miles_total }` or `{ uuid, ok:false, ' +
      'error }`. NOT YET IMPLEMENTED — currently returns `not_implemented`.',
    inputSchema: awardQuoteInputSchema,
    outputSchema: awardQuoteOutputSchema,
    execute: async ({ quotes }) => {
      return {
        results: quotes.map((q) => ({
          uuid: q.uuid,
          ok: false as const,
          error: 'not_implemented',
        })),
      }
    },
  })
}
