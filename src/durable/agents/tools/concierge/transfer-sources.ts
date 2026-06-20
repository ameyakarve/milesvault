import type { KbHttp } from './kb-tools'

// The "Transfer from" universe for the explorer — derived entirely from the KG.
// You can fund an award from a CREDIT CARD (cc/*) or directly from a POINTS
// CURRENCY (currency/* that has an outgoing TRANSFERS_TO edge). Picking a card
// resolves to its currency downstream (resolveCurrency follows DENOMINATED_IN);
// picking a currency uses it directly. Both are exact KG ids — never names.
//
// This is a few-hundred-item list that grows with the KG, so it's meant to be
// computed once and cached (see ConciergeDO.transferSources) and rendered as a
// searchable, grouped combobox.

export type TransferSource = {
  slug: string // exact KG id: `cc/...` or `currency/...`
  name: string // KG display_name
  kind: 'card' | 'currency'
}

// Bounded-concurrency map — the KG has hundreds of card + currency nodes; firing
// every lookup at once would blow the Worker's simultaneous-subrequest budget.
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

const localName = (slug: string) => slug.replace(/^[a-z]+\//, '')

async function displayName(kb: KbHttp, slug: string): Promise<string> {
  try {
    const n = (await kb.get(slug)) as { display_name?: string | null } | null
    return n?.display_name ?? localName(slug)
  } catch {
    return localName(slug)
  }
}

async function listSlugs(kb: KbHttp, prefix: string): Promise<string[]> {
  const r = (await kb.list(prefix, { limit: 1000 })) as { items?: Array<{ slug: string }> }
  return (r.items ?? []).map((i) => i.slug)
}

export async function listTransferSources(kb: KbHttp): Promise<TransferSource[]> {
  // Every credit card.
  const cardSlugs = await listSlugs(kb, 'cc')
  const cards = await pmap(
    cardSlugs,
    12,
    async (slug): Promise<TransferSource> => ({
      slug,
      name: await displayName(kb, slug),
      kind: 'card',
    }),
  )

  // Currencies that can actually transfer out (have ≥1 outgoing TRANSFERS_TO).
  const currencySlugs = await listSlugs(kb, 'currency')
  const transferable = await pmap(currencySlugs, 12, async (slug) => {
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
  const currencies = await pmap(
    currencySlugs.filter((_, i) => transferable[i]),
    12,
    async (slug): Promise<TransferSource> => ({
      slug,
      name: await displayName(kb, slug),
      kind: 'currency',
    }),
  )

  const all = [...cards, ...currencies]
  all.sort((a, b) => a.name.localeCompare(b.name))
  return all
}
