import type { KbHttp } from './kb-tools'

// The set of currencies you can transfer FROM, derived from the KG: every
// `currency/*` node that has at least one outgoing TRANSFERS_TO edge (bank
// card-points, hotel points, etc.). This is the "Transfer from" universe for the
// explorer — never hardcoded. It's a ~50-item list today and grows with the KG,
// so the result is meant to be cached (see ConciergeDO.transferSources) and the
// UI renders it as a searchable combobox.

export type TransferSource = { slug: string; name: string }

// Bounded-concurrency map — the KG has ~150 currency nodes; firing all the
// edge-checks at once would blow the Worker's simultaneous-subrequest budget.
async function pmap<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export async function listTransferSources(kb: KbHttp): Promise<TransferSource[]> {
  const listed = (await kb.list('currency', { limit: 1000 })) as { items?: string[] }
  const slugs = listed.items ?? []

  // Keep only currencies with ≥1 outgoing TRANSFERS_TO edge.
  const flags = await pmap(slugs, 12, async (slug) => {
    try {
      const r = (await kb.related(slug, {
        edge_type: 'TRANSFERS_TO',
        direction: 'outgoing',
        limit: 1,
      })) as { items?: unknown[] }
      return r.items && r.items.length > 0
    } catch {
      return false
    }
  })
  const sourceSlugs = slugs.filter((_, i) => flags[i])

  // Resolve each source's display name from the KG.
  const named = await pmap(sourceSlugs, 12, async (slug): Promise<TransferSource> => {
    try {
      const n = (await kb.get(slug)) as { display_name?: string | null } | null
      return { slug, name: n?.display_name ?? slug.replace(/^currency\//, '') }
    } catch {
      return { slug, name: slug.replace(/^currency\//, '') }
    }
  })

  named.sort((a, b) => a.name.localeCompare(b.name))
  return named
}
