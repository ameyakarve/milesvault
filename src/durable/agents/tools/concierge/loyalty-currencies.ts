import type { KbHttp } from './kb-tools'

// The searchable target universe for the /points page: every loyalty PROGRAMME
// (slug + display name) so the combobox can search "Qantas Frequent Flyer",
// "Avios", "KrisFlyer", … client-side. Compute on demand; ~a few hundred rows.
// The page is programme-keyed end to end (new account model), so the target IS
// a programme.

export type LoyaltyCurrency = { slug: string; name: string }

const prettySlug = (slug: string) =>
  slug
    .replace(/^[a-z]+\//, '')
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')

export async function listLoyaltyCurrencies(kb: KbHttp): Promise<LoyaltyCurrency[]> {
  // list() already returns display_name inline, so a single call is enough — no
  // per-node get() fan-out.
  try {
    const r = (await kb.list('program', { limit: 2000 })) as {
      items?: Array<{ slug: string; display_name?: string | null }>
    }
    return (r.items ?? [])
      .filter((i) => i.slug.startsWith('program/'))
      .map((i) => ({ slug: i.slug, name: i.display_name ?? prettySlug(i.slug) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}
