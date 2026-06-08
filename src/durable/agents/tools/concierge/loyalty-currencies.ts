import type { KbHttp } from './kb-tools'

// The searchable target universe for the /points page: every loyalty currency
// (slug + display name) so the combobox can search "Qantas Points", "Avios", …
// client-side. Compute on demand; the list is ~160 small rows.

export type LoyaltyCurrency = { slug: string; name: string }

const prettySlug = (slug: string) =>
  slug
    .replace(/^[a-z]+\//, '')
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')

export async function listLoyaltyCurrencies(kb: KbHttp): Promise<LoyaltyCurrency[]> {
  let slugs: string[] = []
  try {
    const r = (await kb.list('currency', { limit: 1000 })) as { items?: string[] }
    slugs = r.items ?? []
  } catch {
    slugs = []
  }
  const out: LoyaltyCurrency[] = []
  const CONC = 16
  for (let i = 0; i < slugs.length; i += CONC) {
    const batch = slugs.slice(i, i + CONC)
    const got = await Promise.all(
      batch.map(async (slug): Promise<LoyaltyCurrency | null> => {
        try {
          const n = (await kb.get(slug)) as {
            display_name?: string | null
            attrs?: Record<string, unknown> | null
          }
          // Fiat money (USD, INR, …) lives under currency/ but is never a target.
          if (n?.attrs?.fiat === true) return null
          return { slug, name: n?.display_name ?? prettySlug(slug) }
        } catch {
          return { slug, name: prettySlug(slug) }
        }
      }),
    )
    out.push(...got.filter((c): c is LoyaltyCurrency => c !== null))
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
