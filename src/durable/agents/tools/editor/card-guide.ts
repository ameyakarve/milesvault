import { tool } from 'ai'
import { z } from 'zod'
import type { KbHttp } from '../concierge/kb-tools'

// Fetch a card's drafting guide from the knowledge graph (owner design:
// earn knowledge lives in prose; each card file may carry a "## Logging"
// section whose worked beancount examples ARE the spec, with EARN_RULE
// edges as the per-MCC overrides). Returns everything the drafting agent
// needs in one call: the Logging guide, the reward pool (ticker + account
// path), the DENOMINATED_IN rate notes, and every exception.
export function cardGuideTool(kb: KbHttp) {
  return tool({
    description:
      'Fetch a credit card’s drafting guide from the knowledge graph: earn rules in prose with worked beancount examples (follow them exactly — accounts, tickers, :Pending accruals), the reward pool it earns into, and every per-MCC exception/override. Call this ONCE before drafting transactions for a card (statements especially), then draft per the guide. If `logging_guide` is null, fall back to `rate_notes` + `card_notes` and say estimates are best-effort.',
    inputSchema: z.object({
      card: z
        .string()
        .describe('The card as the user/statement names it, e.g. "Axis Magnus Burgundy"'),
    }),
    execute: async ({ card }) => {
      try {
        const r = (await kb.resolve(card, { prefix: 'cc', limit: 3 })) as {
          items?: Array<{ slug: string; display_name: string | null }>
        }
        const top = r.items?.[0]
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

        const rel = (await kb.related(top.slug, { direction: 'outgoing' })) as {
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
          const leaf = cur?.attrs?.beancountName
          const ticker = cur?.attrs?.ticker
          pool = {
            currency: denom.other,
            name: cur?.display_name ?? null,
            ticker: typeof ticker === 'string' ? ticker : null,
            account:
              typeof issuer === 'string' && typeof leaf === 'string'
                ? `Assets:Rewards:Cards:${issuer}:${leaf}`
                : null,
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
    },
  })
}
