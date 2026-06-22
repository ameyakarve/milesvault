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
      // `beancountName` is the card's canonical leaf and `account` its full
      // canonical liability path (`Liabilities:CreditCards:<IssuerBn>:<CardBn>`),
      // both straight from the graph — callers MUST use these verbatim and never
      // munge a leaf from `name` (the display H1).
      card: { slug: string; name: string | null; beancountName: string | null; account: string | null }
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
  | {
      ok: false
      error: string
      candidates?: Array<{ slug: string; name: string | null; aliases?: string[] }>
      hint?: string
    }

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
    // NO fuzzy name resolution. A card is identified by its EXACT slug: the model
    // (after a card_not_found) and the add-card picker pass the cc/… slug, and
    // card-identify passes knownTop. A free-text name with no slug is never
    // guessed — it falls straight through to the full closed-set list below for
    // the model to pick from.
    const slugInput = /^cc\//.test(card.trim()) ? card.trim() : null
    const top: Item | undefined =
      knownTop ?? (slugInput ? { slug: slugInput, display_name: null } : undefined)
    if (!top) {
      // No exact slug in hand. Hand the model the FULL valid card set (the
      // closed set) and let IT pick — no fuzzy resolve, no code arbiter, no
      // token-overlap narrowing. The candidate NAME is derived from the SLUG, which spells out
      // words the display H1 may punctuate (slug `hsbc-live-plus` → "Hsbc Live
      // Plus", matching a user's "HSBC Live Plus" where the H1 "HSBC Live+" does
      // NOT). The model re-calls card_guide with the chosen `slug`.
      const all = await listCards(kb)
      if (all.length > 0) {
        return {
          ok: false as const,
          error: 'card_not_found' as const,
          candidates: all.map((c) => ({
            slug: c.slug,
            name: c.name,
            ...(c.aliases.length ? { aliases: c.aliases } : {}),
          })),
          hint: 'Pick the matching card from this list and call card_guide again with its exact `slug` (the cc/… value) as the `card` argument. Match against `name` OR any of `aliases` (a card may be held/known under an alias). Only if NONE of these is the card does it have no guide.',
        }
      }
      return { ok: false as const, error: 'card_not_found' as const }
    }

    const node = (await kb.get(top.slug)) as {
      display_name?: string | null
      content_md?: string
      source_file?: string
      attrs?: Record<string, unknown> | null
    } | null
    const cardBn = typeof node?.attrs?.beancountName === 'string' ? node.attrs.beancountName : null
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

    // Issuer beancountName (ISSUED_BY → bank) — used for BOTH the reward-pool
    // account AND the card's canonical liability path. Both come from the graph
    // verbatim; nothing is munged from the display H1.
    const bankEdge = items.find((i) => i.edge_type === 'ISSUED_BY')
    const bank = bankEdge
      ? ((await kb.get(bankEdge.other).catch((): null => null)) as {
          attrs?: Record<string, unknown> | null
        } | null)
      : null
    const issuerBn = typeof bank?.attrs?.beancountName === 'string' ? bank.attrs.beancountName : null
    const cardAccount =
      issuerBn && cardBn ? `Liabilities:CreditCards:${issuerBn}:${cardBn}` : null

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
      const ticker = cur?.attrs?.ticker
      pool = {
        currency: denom.other,
        name: cur?.display_name ?? null,
        ticker: typeof ticker === 'string' ? ticker : null,
        // One account per issuer wallet (owner convention): the account
        // says WHERE points live; the commodity says WHAT they are.
        account: issuerBn ? `Assets:Rewards:${issuerBn}` : null,
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
      card: {
        slug: top.slug,
        name: node?.display_name ?? top.display_name,
        beancountName: cardBn,
        account: cardAccount,
      },
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
// name plus the slug to resolve by, AND the card's other names (display_name +
// alias slugs) so the model can match a held account by ANY of its names.
export async function listCards(
  kb: KbHttp,
): Promise<Array<{ slug: string; name: string; aliases: string[] }>> {
  // kb.list returns `{ items: [{slug, display_name, aliases[]}] }`. The NAME the
  // model matches against is derived from the SLUG (the slug spells out words the
  // display H1 may punctuate: `cc/hsbc-live-plus` → "Hsbc Live Plus", matching a
  // user's "HSBC Live Plus" where the H1 "HSBC Live+" does NOT). The display_name
  // and the prettified alias slugs ride along as `aliases`, so a held account leaf
  // like `…:HSBC:Cashback` matches via the `cc/hsbc-cashback` alias of canonical
  // `cc/hsbc-live-plus` — exact, no fuzzy resolve.
  const r = (await kb.list('cc', { limit: 250 })) as {
    items?: Array<{ slug: string; display_name?: string | null; aliases?: string[] }>
  }
  const pretty = (s: string) =>
    s
      .replace(/^cc\//, '')
      .split('-')
      .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
      .join(' ')
  return (r.items ?? [])
    .filter((i) => i && typeof i.slug === 'string' && i.slug.startsWith('cc/'))
    .map((i) => {
      const name = pretty(i.slug)
      const aliases = Array.from(
        new Set(
          [i.display_name ?? '', ...(i.aliases ?? []).map(pretty)]
            .map((s) => s.trim())
            .filter((s) => s && s !== name),
        ),
      )
      return { slug: i.slug, name, aliases }
    })
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
  const listed = (await kb.list('currency', { limit: 1000 })) as {
    items?: Array<{ slug: string }>
  }
  const slugs = (listed.items ?? []).map((i) => i.slug)
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

// For the user's held reward accounts, surface the KG's aliases for each — so
// the editor's account manifest can show "Assets:Rewards:Points:AllRewards …
// (aka accor, all)" and the model maps a programme word the user types to the
// exact account. PURE READ: every currency has a `currency/<ticker-lowercased>`
// alias slug, so kb_get by ticker returns the canonical node's display name +
// every alias pointing to it (kb_get.aliases). No derivation, no matching.
export async function rewardAccountAliases(
  kb: KbHttp,
  accounts: ReadonlyArray<{ account: string; currencies: string[] }>,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  await Promise.all(
    accounts
      .filter((a) => a.account.startsWith('Assets:Rewards:'))
      .map(async (a) => {
        const names = new Set<string>()
        for (const ccy of a.currencies) {
          const node = (await kb.get(`currency/${ccy.toLowerCase()}`).catch((): null => null)) as {
            display_name?: string | null
            aliases?: string[]
          } | null
          if (!node) continue
          if (node.display_name) names.add(node.display_name)
          for (const al of node.aliases ?? []) {
            const short = al.split('/').pop()
            if (short) names.add(short)
          }
        }
        if (names.size > 0) out[a.account] = [...names].join(', ')
      }),
  )
  return out
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
      'Fetch a credit card’s drafting guide from the knowledge graph: earn rules in prose with worked beancount examples (follow them exactly — accounts, tickers, :Pending accruals), the reward pool it earns into, and every per-MCC exception/override. Call this before drafting transactions for a card, then draft per the guide. If it returns `card_not_found` with a `candidates` list, that is the full set of known cards — pick the one that matches and call again with its exact `slug` (NOT the display name). If `logging_guide` is null, fall back to `rate_notes` + `card_notes` and say estimates are best-effort.',
    inputSchema: z.object({
      card: z
        .string()
        .describe(
          'The card as the user/statement names it (e.g. "Axis Magnus Burgundy"), OR — after a card_not_found — the exact `cc/…` slug of the matching candidate.',
        ),
    }),
    execute: async ({ card }) => fetchCardGuide(kb, card),
  })
}
