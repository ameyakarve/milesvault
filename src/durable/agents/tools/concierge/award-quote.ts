import { tool } from 'ai'
import { z } from 'zod'
import { priceProgramme, resolveProgrammeId } from './award-engine'
import type { AirportLookup } from './award-engine'

const LEG = z.object({
  origin: z.string().describe('Origin airport IATA code, e.g. "BLR".'),
  destination: z.string().describe('Destination airport IATA code, e.g. "NRT".'),
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

// One freeform line per quote: every cabin's award miles for the itinerary,
// with peak/off-peak and own/partner rates spelled out inline where they
// differ. `program` is the programme id we ACTUALLY priced (after resolving
// the caller's free-text name); when the name doesn't resolve we echo the
// requested name back verbatim. Either way every result names its programme,
// so the caller can't mislabel a quote or hide a name→programme mismatch.
const awardQuoteOutputSchema = z.object({
  results: z.array(
    z.object({
      uuid: z.string(),
      program: z.string(),
      text: z.string(),
    }),
  ),
})

type QuoteInput = z.infer<typeof QUOTE>

// Entry cabin field → display label.
type CabinField = 'economy' | 'premium_economy' | 'business' | 'first'
const CABIN_FIELDS: ReadonlyArray<[CabinField, string]> = [
  ['economy', 'economy'],
  ['premium_economy', 'premium'],
  ['business', 'business'],
  ['first', 'first'],
]

const fmt = (n: number) => n.toLocaleString('en-US')
const range = (r: [number, number]) =>
  r[0] === r[1] ? fmt(r[0]) : `${fmt(r[0])}–${fmt(r[1])}`

interface QuoteResult {
  program: string
  text: string
}

function quoteText(q: QuoteInput, lookup: AirportLookup): QuoteResult {
  const id = resolveProgrammeId(q.program)
  // Unresolved: echo the requested name so the caller sees what failed.
  if (!id) return { program: q.program, text: `no award chart for "${q.program}"` }

  const priced = priceProgramme(
    id,
    q.legs.map((l) => ({ origin: l.origin, destination: l.destination, carrier: l.carrier })),
    lookup,
  )
  if ('error' in priced) {
    return {
      program: id,
      text: priced.error.startsWith('unknown_airport')
        ? `unknown airport (${priced.error.split(': ')[1] ?? ''})`
        : 'not priceable',
    }
  }

  const entries = priced.entries
  if (entries.length === 0)
    return { program: id, text: 'not available on this programme' }

  const multiChart = new Set(entries.map((e) => e.chart)).size > 1
  const lines: string[] = []
  for (const [field, label] of CABIN_FIELDS) {
    const parts: string[] = []
    for (const e of entries) {
      const r = e[field]
      if (!r) continue
      const val = range(r)
      const tag = [
        multiChart ? e.chart : '',
        e.season && e.season !== 'default' ? e.season : '',
      ]
        .filter(Boolean)
        .join(' ')
      parts.push(tag ? `${tag} ${val}` : val)
    }
    if (parts.length) lines.push(`${label} ${[...new Set(parts)].join(' / ')}`)
  }
  if (lines.length === 0)
    return { program: id, text: 'not available on this programme' }
  return { program: id, text: `${lines.join('; ')} miles` }
}

// Server tool: batch award-flight pricing across the bundled ~45-programme
// engine. Airports resolve against the ConciergeDO SQLite (injected lookup).
export function awardQuoteTool(lookup: AirportLookup) {
  return tool({
    description:
      'Batch award-flight pricing across ~45 frequent-flyer programmes. ' +
      'Input `quotes`: each has a `uuid`, a `program` (FFP whose miles you ' +
      'spend — e.g. "air india", "krisflyer", "avios"), and ordered one-way ' +
      '`legs` ({ origin, destination } IATA, `carrier` IATA). No date, no ' +
      'cabin. Returns `results` 1:1 by `uuid`: `{ uuid, text }`, where `text` ' +
      'lists every cabin (economy/premium/business/first) for the itinerary ' +
      '— with peak/off-peak and own/partner rates spelled out inline where ' +
      'they differ, or a short reason if not priceable.',
    inputSchema: awardQuoteInputSchema,
    outputSchema: awardQuoteOutputSchema,
    execute: async ({ quotes }) => {
      return {
        results: quotes.map((q) => {
          try {
            const { program, text } = quoteText(q, lookup)
            return { uuid: q.uuid, program, text }
          } catch {
            return { uuid: q.uuid, program: q.program, text: 'not priceable' }
          }
        }),
      }
    },
  })
}
