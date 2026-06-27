import type { KbHttp } from './kb-tools'

// The searchable target universe for the /points page: every loyalty PROGRAMME
// (slug + display name) so the combobox can search "Qantas Frequent Flyer",
// "Avios", "KrisFlyer", … client-side. Compute on demand; ~a few hundred rows.
// The page is programme-keyed end to end (new account model), so the target IS
// a programme.

// `aliases` are the programme's incoming alias slugs, prettified into search
// tokens (e.g. program/singapore-airlines → "Singapore Airlines") so the picker
// matches a programme by its operating airline / brand, not just its name.
export type LoyaltyCurrency = { slug: string; name: string; aliases: string[] }

const prettySlug = (slug: string) =>
  slug
    .replace(/^[a-z]+\//, '')
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')

export async function listLoyaltyCurrencies(kb: KbHttp): Promise<LoyaltyCurrency[]> {
  // list() returns display_name + the node's incoming alias slugs inline, so a
  // single call is enough — no per-node fan-out.
  try {
    const r = (await kb.list('program', { limit: 2000 })) as {
      items?: Array<{ slug: string; display_name?: string | null; aliases?: string[] }>
    }
    return (r.items ?? [])
      .filter((i) => i.slug.startsWith('program/'))
      .map((i) => ({
        slug: i.slug,
        name: i.display_name ?? prettySlug(i.slug),
        aliases: (i.aliases ?? []).map(prettySlug),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

export type SlugName = { slug: string; name: string }

// Every credit card (cc/ slug + display name). Cards are also valid `/points`
// targets in book-from mode (?target=cc/<card>&dir=from), and the concierge
// cites card slugs for card questions — so it needs this closed list too, not
// just programmes.
export async function listCards(kb: KbHttp): Promise<SlugName[]> {
  try {
    const r = (await kb.list('cc', { limit: 2000 })) as {
      items?: Array<{ slug: string; display_name?: string | null }>
    }
    return (r.items ?? [])
      .filter((i) => i.slug.startsWith('cc/'))
      .map((i) => ({ slug: i.slug, name: i.display_name ?? prettySlug(i.slug) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}
