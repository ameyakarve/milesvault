import { tool } from 'ai'
import { z } from 'zod'
import type { KbHttp } from '../concierge/kb-tools'

// Fetch a card's drafting guide from the knowledge graph (owner design:
// earn knowledge lives in prose; each card file may carry a "## Logging"
// section whose worked beancount examples ARE the spec, with EARN_RULE
// edges as the per-MCC overrides). Returns everything the drafting agent
// needs in one call: the Logging guide, the reward pool (ticker + account
// path), the DENOMINATED_IN rate notes, and every exception.
export type CardGuideResult =
  | {
      ok: true
      card: { slug: string; name: string | null }
      pool: {
        currency: string
        name: string | null
        ticker: string | null
        account: string | null
        rate_notes: string | null
      } | null
      overrides: Array<{ mcc: string; name: string | null; rule: string | null }>
      logging_guide: string | null
      card_notes: string | null
    }
  | { ok: false; error: string; candidates?: Array<{ slug: string; name: string | null }>; hint?: string }

// Shared by the agent tool AND the deterministic ingest pipeline.
export async function fetchCardGuide(
  kb: KbHttp,
  card: string,
  // Closed-set path: when card-identify matched the statement against the full
  // card list (listCards) we already hold the exact node — skip fuzzy resolve.
  knownTop?: { slug: string; display_name: string | null },
): Promise<CardGuideResult> {
  try {
    type Item = { slug: string; display_name: string | null }
    const resolve = async (q: string): Promise<Item[]> => {
      const r = (await kb.resolve(q, { prefix: 'cc', limit: 5 })) as {
        items?: Item[]
      }
      return r.items ?? []
    }
    // Resolution is literal display-name matching; statements add filler
    // the KG nodes omit. No hardcoded vocabulary: on a miss, gather
    // candidates by per-token recall — a single hit is used directly,
    // multiple go back as options.
    let top: Item | undefined = knownTop ?? (await resolve(card))[0]
    if (!top) {
      // Score-based recall: every token (≥4 chars) votes; the card matching
      // the MOST tokens wins. A first-token cap here once truncated the
      // candidate set to six 'Axis…' cards that didn't include the right
      // one, and an overlap-chooser then picked a plausible WRONG card —
      // the worst failure mode. Discriminative tokens now always count.
      const votes = new Map<string, { item: Item; n: number }>()
      for (const token of card.split(/\s+/)) {
        if (token.length < 4) continue
        for (const it of await resolve(token)) {
          const v = votes.get(it.slug)
          if (v) v.n++
          else votes.set(it.slug, { item: it, n: 1 })
        }
      }
      const ranked = [...votes.values()].sort((a, b) => b.n - a.n)
      const max = ranked[0]?.n ?? 0
      const topScorers = ranked.filter((r) => r.n === max)
      // ≥2 token agreement and a unique winner → confident pick.
      if (max >= 2 && topScorers.length === 1) top = topScorers[0]!.item
      else if (ranked.length > 0) {
        return {
          ok: false as const,
          error: 'card_not_found' as const,
          candidates: topScorers.slice(0, 6).map((r) => ({
            slug: r.item.slug,
            name: r.item.display_name,
          })),
          hint: 'Pick the matching card and call card_guide again with its exact `name`.',
        }
      }
    }
    if (!top) return { ok: false as const, error: 'card_not_found' as const }

    const node = (await kb.get(top.slug)) as {
      display_name?: string | null
      content_md?: string
      source_file?: string
    } | null
    // The ::node block holds only the title — the card's prose sections
    // (## Logging, ## Fees…) live in the FILE body, so fetch that.
    let content = node?.content_md ?? ''
    if (node?.source_file) {
      const file = (await kb.getFile(node.source_file).catch((): null => null)) as {
        content_md?: string
      } | null
      if (file?.content_md) content = file.content_md
    }
    const logging = /## Logging[\s\S]*?(?=\n## |$)/.exec(content)?.[0] ?? null

    // High limit: cards with many per-MCC EARN_RULE edges (Swiggy HDFC has
    // ~100) would otherwise truncate the default page and drop the ISSUED_BY /
    // DENOMINATED_IN edges that carry the issuer + reward pool.
    const rel = (await kb.related(top.slug, { direction: 'outgoing', limit: 500 })) as {
      items?: Array<{ edge_type: string; other: string; description_md: string | null }>
    }
    const items = rel.items ?? []

    const denom = items.find(
      (i) => i.edge_type === 'DENOMINATED_IN' && i.other.startsWith('currency/'),
    )
    let pool: {
      currency: string
      name: string | null
      ticker: string | null
      account: string | null
      rate_notes: string | null
    } | null = null
    if (denom) {
      const cur = (await kb.get(denom.other).catch((): null => null)) as {
        display_name?: string | null
        attrs?: Record<string, unknown> | null
      } | null
      const bankEdge = items.find((i) => i.edge_type === 'ISSUED_BY')
      const bank = bankEdge
        ? ((await kb.get(bankEdge.other).catch((): null => null)) as {
            attrs?: Record<string, unknown> | null
          } | null)
        : null
      const issuer = bank?.attrs?.beancountName
      const ticker = cur?.attrs?.ticker
      pool = {
        currency: denom.other,
        name: cur?.display_name ?? null,
        ticker: typeof ticker === 'string' ? ticker : null,
        // One account per issuer wallet (owner convention): the account
        // says WHERE points live; the commodity says WHAT they are.
        account: typeof issuer === 'string' ? `Assets:Rewards:${issuer}` : null,
        rate_notes: denom.description_md ?? null,
      }
    }

    const overrides = await Promise.all(
      items
        .filter((i) => i.edge_type === 'EARN_RULE')
        .slice(0, 12)
        .map(async (i) => {
          const mcc = (await kb.get(i.other).catch((): null => null)) as {
            display_name?: string | null
          } | null
          return { mcc: i.other, name: mcc?.display_name ?? null, rule: i.description_md ?? null }
        }),
    )

    return {
      ok: true as const,
      card: { slug: top.slug, name: node?.display_name ?? top.display_name },
      pool,
      overrides,
      logging_guide: logging,
      // When no Logging section exists yet, give the model the prose to
      // reason from (clearly a fallback, not the spec).
      card_notes: logging ? null : content.slice(0, 1500),
    }
  } catch (e) {
    return { ok: false as const, error: String(e) }
  }
}

// Closed-set fetch: card-identify already picked an exact card from the KG
// list, so resolve by its slug directly — no fuzzy matching, no filler-word
// dilution. `name` is the display name to echo back in the result.
export async function fetchCardGuideBySlug(
  kb: KbHttp,
  slug: string,
  name: string | null,
): Promise<CardGuideResult> {
  return fetchCardGuide(kb, name ?? slug, { slug, display_name: name })
}

// Every credit card in the KG, for the card-identify closed set: a readable
// name (display_name, or a prettified slug) plus the slug to resolve by.
export async function listCards(kb: KbHttp): Promise<Array<{ slug: string; name: string }>> {
  // kb.list returns `{ items: string[] }` — each item is a SLUG string, not an
  // object. The readable name (for the model to match against) is derived from
  // the slug; resolution is by slug, so the derived name only needs to be
  // recognisable ("cc/swiggy-hdfc" → "Swiggy Hdfc").
  const r = (await kb.list('cc', { limit: 250 })) as { items?: string[] }
  const pretty = (s: string) =>
    s
      .replace(/^cc\//, '')
      .split('-')
      .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
      .join(' ')
  return (r.items ?? [])
    .filter((s) => typeof s === 'string' && s.startsWith('cc/'))
    .map((slug) => ({ slug, name: pretty(slug) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function cardGuideTool(kb: KbHttp) {
  return tool({
    description:
      'Fetch a credit card’s drafting guide from the knowledge graph: earn rules in prose with worked beancount examples (follow them exactly — accounts, tickers, :Pending accruals), the reward pool it earns into, and every per-MCC exception/override. Call this ONCE before drafting transactions for a card (statements especially), then draft per the guide. If `logging_guide` is null, fall back to `rate_notes` + `card_notes` and say estimates are best-effort.',
    inputSchema: z.object({
      card: z
        .string()
        .describe('The card as the user/statement names it, e.g. "Axis Magnus Burgundy"'),
    }),
    execute: async ({ card }) => fetchCardGuide(kb, card),
  })
}
