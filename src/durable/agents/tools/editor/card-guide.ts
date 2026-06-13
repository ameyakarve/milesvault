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
    const top: Item | undefined = knownTop ?? (await resolve(card))[0]
    if (!top) {
      // Direct resolve missed. Gather candidates by per-token recall and hand
      // them BACK for the MODEL to pick — code never auto-selects a card (that
      // overlap auto-pick once chose a plausible WRONG card, the worst failure
      // mode, and is exactly the name-matching arbiter the owner banned).
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
      if (ranked.length > 0) {
        return {
          ok: false as const,
          error: 'card_not_found' as const,
          candidates: ranked.slice(0, 6).map((r) => ({
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

// Every reward programme / loyalty currency in the KG, with its EXACT canonical
// Beancount account and ticker — the closed set the editor picks from instead of
// assembling account paths itself (gemma drops the `:Miles:`/`:Points:` segment
// when handed only a beancountName + a prose convention). Same classification as
// /api/kb/programmes (the add-dialog's Programmes tab): airline FFP slugs end in
// `-miles` → Assets:Rewards:Miles; everything else → Assets:Rewards:Points.
export type RewardAccount = { slug: string; name: string; account: string; ticker: string }

export async function listRewardAccounts(kb: KbHttp): Promise<RewardAccount[]> {
  const listed = (await kb.list('currency', { limit: 1000 })) as { items?: string[] }
  const slugs = listed.items ?? []
  const items: RewardAccount[] = []
  const CONC = 16
  for (let i = 0; i < slugs.length; i += CONC) {
    const got = await Promise.all(
      slugs.slice(i, i + CONC).map(async (slug): Promise<RewardAccount | null> => {
        try {
          const n = (await kb.get(slug)) as {
            display_name?: string | null
            attrs?: Record<string, unknown> | null
          }
          const a = n?.attrs ?? {}
          if (a.fiat === true) return null
          const bn = typeof a.beancountName === 'string' ? a.beancountName : null
          const ticker = typeof a.ticker === 'string' ? a.ticker : null
          if (!bn || !ticker) return null
          const kind = slug.endsWith('-miles') ? 'Miles' : 'Points'
          return { slug, name: n?.display_name ?? bn, account: `Assets:Rewards:${kind}:${bn}`, ticker }
        } catch {
          return null
        }
      }),
    )
    for (const g of got) if (g) items.push(g)
  }
  items.sort((a, b) => a.name.localeCompare(b.name))
  return items
}

// Resolve ONE card's canonical liability account from the KG — its
// `beancountName` under its issuer's `beancountName`. The add-accounts UI uses
// this so a card opened there gets the SAME account a statement would, instead
// of munging it from the display name client-side.
export async function resolveCardAccount(kb: KbHttp, slug: string): Promise<string | null> {
  const card = (await kb.get(slug).catch((): null => null)) as {
    attrs?: Record<string, unknown> | null
  } | null
  const cardBn = typeof card?.attrs?.beancountName === 'string' ? card.attrs.beancountName : null
  if (!cardBn) return null
  const rel = (await kb
    .related(slug, { edge_type: 'ISSUED_BY', direction: 'outgoing' })
    .catch((): null => null)) as { items?: Array<{ other: string }> } | null
  const issuerSlug = rel?.items?.[0]?.other
  if (!issuerSlug) return null
  const bank = (await kb.get(issuerSlug).catch((): null => null)) as {
    attrs?: Record<string, unknown> | null
  } | null
  const issuerBn = typeof bank?.attrs?.beancountName === 'string' ? bank.attrs.beancountName : null
  if (!issuerBn) return null
  return `Liabilities:CreditCards:${issuerBn}:${cardBn}`
}

export function rewardAccountsTool(kb: KbHttp) {
  return tool({
    description:
      'List every reward programme / loyalty currency in the knowledge graph with its EXACT canonical Beancount account and commodity ticker (each item is shaped { name, account, ticker } — e.g. account "Assets:Rewards:Miles:<Programme>", ticker "<TICKER>"). Call this ONCE before drafting any miles/points entry — earn, transfer, redemption, or balance — then copy the `account` and `ticker` for the matching programme VERBATIM. Do NOT assemble reward account paths yourself and do NOT invent a ticker. If the programme is not in the list, ask the user rather than guessing an account.',
    inputSchema: z.object({}),
    execute: async () => ({ items: await listRewardAccounts(kb) }),
  })
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
