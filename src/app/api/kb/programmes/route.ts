import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { kbHttpOverFetch } from '@/durable/agents/tools/concierge/kb-tools'

export const dynamic = 'force-dynamic'

// Loyalty programmes (non-fiat currencies) with their canonical rewards
// account + ticker — powers the Programmes tab of the add dialog.
// Airline FFPs (slug …-miles) live under Assets:Rewards:Miles; everything
// else (hotel/other) under Assets:Rewards:Points (taxonomy in examples.md).
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { env } = await getCloudflareContext({ async: true })
  const kb = kbHttpOverFetch('https://kb', (env as Cloudflare.Env).KB)
  const listed = (await kb.list('currency', { limit: 1000 })) as { items?: string[] }
  const slugs = listed.items ?? []

  const items: Array<{ slug: string; name: string; account: string; ticker: string }> = []
  const CONC = 16
  for (let i = 0; i < slugs.length; i += CONC) {
    const batch = slugs.slice(i, i + CONC)
    const got = await Promise.all(
      batch.map(async (slug) => {
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
          return {
            slug,
            name: n?.display_name ?? bn,
            account: `Assets:Rewards:${kind}:${bn}`,
            ticker,
          }
        } catch {
          return null
        }
      }),
    )
    for (const g of got) if (g) items.push(g)
  }
  items.sort((a, b) => a.name.localeCompare(b.name))
  return NextResponse.json({ items })
}
