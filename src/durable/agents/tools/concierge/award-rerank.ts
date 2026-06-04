import { generateObject } from 'ai'
import type { LanguageModel } from 'ai'
import { z } from 'zod'
import type { CabinRange } from './award-engine'

// The pay-side / prioritisation half of award_options, as a focused LLM call.
// The objective fly-options + funding facts are computed deterministically;
// this only REORDERS them for the specific user, interpreting free-text intent
// + holdings that would be a nightmare to model as parameters. It never
// recomputes or invents numbers — it returns an ordering over given ids.

type CabinSet = {
  economy: CabinRange
  premium_economy: CabinRange
  business: CabinRange
  first: CabinRange
}

export type RerankItem = {
  id: string
  programme: string
  currency: string | null
  stops: number
  own_metal: boolean
  routing: string
  cabins: CabinSet // miles the programme charges
  funding: { source: string; multiplier: number; hops: number; cost: CabinSet } | null
}

export type RerankPayload = {
  origin: string
  destination: string
  intent?: string
  holdings: string[]
  items: RerankItem[]
}

export type RerankResult = Array<{ id: string; why: string }>
export type AwardReranker = (payload: RerankPayload) => Promise<RerankResult | null>

const SCHEMA = z.object({
  ranked: z.array(
    z.object({
      id: z.string().describe('an id from the given options'),
      why: z.string().describe('one short line — why it sits here'),
    }),
  ),
})

export function buildRerankPrompt(p: RerankPayload): string {
  return [
    `You rank award-flight options for one user. The route ${p.origin}→${p.destination} is fixed; do not drop options for being "wrong" — only reorder.`,
    p.intent ? `User said: "${p.intent}"` : `The user stated no preference.`,
    p.holdings.length
      ? `User's point balances are in these currencies (raw ledger codes): ${p.holdings.join(', ')}.`
      : `User's holdings are unknown.`,
    ``,
    `Each option already carries its cost: \`cabins\` = miles the programme charges; \`funding\` = the cheapest way to pay from the user's holdings (source currency + per-cabin \`cost\` in the user's own points), or null if they can't fund it from what they hold.`,
    ``,
    `Order best-first, by these priorities:`,
    `1. Honour explicit intent — the cabin they want, the points they say they want to use.`,
    `2. Prefer options they can actually fund (\`funding\` not null), cheaper card-points \`cost\` first.`,
    `3. Then nonstop over connections; then own-metal (fewer fuel surcharges).`,
    `Include EVERY id exactly once. Never change a number or invent an option.`,
    ``,
    `Options:`,
    JSON.stringify(p.items),
    ``,
    `Return {"ranked":[{"id","why"}, ...]} — every id, best first.`,
  ].join('\n')
}

// Bind a model into a reranker. Returns null on any failure so the caller
// falls back to the deterministic order — the rerank is advisory, never load-bearing.
export function makeAwardReranker(model: LanguageModel): AwardReranker {
  return async (payload) => {
    try {
      const { object } = await generateObject({
        model,
        schema: SCHEMA,
        prompt: buildRerankPrompt(payload),
      })
      return object.ranked
    } catch {
      return null
    }
  }
}
