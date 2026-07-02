import { z } from 'zod'

// The richer award-price model — the source of truth for what a single
// (legs, programme, class) key costs. See the taxonomy discussion: fixing the
// legs+programme+class collapses the "how it's derived" axes (zone/distance/
// segment/own-vs-partner/routing) into a concrete answer; what stays open for
// the key is date/season and membership. This model expresses exactly that.
//
// Two orthogonal axes:
//   • the bounds — an Amount is an exact value or a band (either end open)
//   • the tiers — a list, each a labeled, optionally-gated price
// so "dynamic within a range", "floor + dynamic upward", discrete seasonal
// tiers, and elite/special rates all fall out without special cases.

// The legacy per-cabin cell the explorer/UI still renders. Kept for display.
export type CabinCell = [number, number] | 'dynamic' | null

// An exact points value, or a dynamic band; `null` on an end = open there.
export type Amount = { fixed: number } | { from: number | null; to: number | null }

// A labeled, optionally-gated price. Seasonal tiers ("off-peak"/"peak") and
// conditional rates (elite special, member discount) are the same shape — a
// price available under a condition (`requires`; null = standard/anyone).
export type Tier = {
  label: string | null
  requires: string | null
  amount: Amount
}

// The award for one (legs, programme, class). `not_offered` = this cabin isn't
// sold on this routing (a per-class null). Otherwise a non-empty tier list plus
// where the numbers came from. cash/channel/basis/notes are reserved for the
// per-module enrichment phase (the adapter can't infer them today) and omitted
// until a module provides them.
export type Award =
  | { status: 'not_offered' }
  | {
      status: 'bookable'
      price: Tier[]
      source: 'published' | 'derived'
      cash?: { surcharge: 'none' | 'low' | 'high'; taxes: number | 'varies' }
      channel?: 'online' | 'phone'
      basis?: 'one_way' | 'round_trip'
      notes?: string[]
    }

const AMOUNT = z.union([
  z.object({ fixed: z.number() }),
  z.object({ from: z.number().nullable(), to: z.number().nullable() }),
])
const TIER = z.object({
  label: z.string().nullable(),
  requires: z.string().nullable(),
  amount: AMOUNT,
})
export const AWARD = z
  .union([
    z.object({ status: z.literal('not_offered') }),
    z.object({
      status: z.literal('bookable'),
      price: z.array(TIER).min(1),
      source: z.enum(['published', 'derived']),
      cash: z
        .object({ surcharge: z.enum(['none', 'low', 'high']), taxes: z.union([z.number(), z.literal('varies')]) })
        .optional(),
      channel: z.enum(['online', 'phone']).optional(),
      basis: z.enum(['one_way', 'round_trip']).optional(),
      notes: z.array(z.string()).optional(),
    }),
  ])
  .describe(
    'Award price for one cabin: {status:"not_offered"} if the cabin is not sold on this routing, else {status:"bookable", price:[tiers]} where each tier has a label, an access condition (requires), and an amount that is either {fixed} or a band {from,to} (null end = open). Seasonal AND elite/special rates are both tiers.',
  )

// ---- Adapters: bridge today's engine output (a CabinCell + the programme's
// `published` flag) to/from the model, so display stays identical while the
// richer model is captured. Round-trips exactly:
//   toCabinCell(toAward(cell, pub)) === (pub ? cell : dynamic-if-offered)

export function toAward(cell: CabinCell, published: boolean): Award {
  if (cell == null) return { status: 'not_offered' }
  const source = published ? 'published' : 'derived'
  // Fully dynamic: an explicit "dynamic" marker, or ANY range on an unpublished
  // programme (its numbers aren't real bookable tiers — don't quote them).
  if (cell === 'dynamic' || !published) {
    return { status: 'bookable', source, price: [{ label: null, requires: null, amount: { from: null, to: null } }] }
  }
  const [min, max] = cell
  if (min === max) {
    return { status: 'bookable', source, price: [{ label: null, requires: null, amount: { fixed: min } }] }
  }
  // A published range today means off-peak..peak — two discrete fixed tiers.
  return {
    status: 'bookable',
    source,
    price: [
      { label: 'off-peak', requires: null, amount: { fixed: min } },
      { label: 'peak', requires: null, amount: { fixed: max } },
    ],
  }
}

// Project the model back to the legacy cell the UI renders: any dynamic band
// collapses to "dynamic"; a set of fixed tiers becomes [min,max]; not_offered is
// null. Derivable, lossless for display — nothing faked.
export function toCabinCell(award: Award): CabinCell {
  if (award.status === 'not_offered') return null
  const amounts = award.price.map((t) => t.amount)
  if (amounts.some((a) => 'from' in a)) return 'dynamic'
  const fixed = (amounts as { fixed: number }[]).map((a) => a.fixed)
  return [Math.min(...fixed), Math.max(...fixed)]
}
