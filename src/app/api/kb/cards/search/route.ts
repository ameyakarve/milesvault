import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { kbHttpOverFetch } from '@/durable/agents/tools/concierge/kb-tools'
import { matchesTokens } from '@/lib/search-match'

export const dynamic = 'force-dynamic'

// Typeahead over the knowledge graph's credit-card nodes — powers the
// add_card gen-UI picker in the editor chat.
//
// We list every card once and match in-memory with a tokenized matcher over each
// card's display name + slug + aliases. This beats the KB's substring resolve:
// a spaced query ("American Express") tokenizes the same as the hyphenated alias
// slug ("cc/american-express-platinum"), so issuer/brand names that the display
// abbreviates (Amex → American Express) become searchable via an alias, in any
// word order, with prefix matching for partial typing.
export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth()
  if (!session?.user?.key) return new NextResponse('unauthorized', { status: 401 })
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ items: [] })

  const { env } = await getCloudflareContext({ async: true })
  const kb = kbHttpOverFetch('https://kb', (env as Cloudflare.Env).KB)
  const r = (await kb.list('cc', { limit: 400 })) as {
    items?: Array<{ slug: string; display_name?: string | null; aliases?: string[] }>
  }

  const ql = q.toLowerCase()
  const matched = (r.items ?? [])
    .filter((c) => c.slug.startsWith('cc/'))
    .map((c) => ({
      slug: c.slug,
      name: c.display_name ?? null,
      // searchable surface: display + slug words + alias slugs
      hay: [c.display_name ?? '', c.slug.replace(/^cc\//, ''), ...(c.aliases ?? [])].join(' '),
    }))
    .filter((c) => matchesTokens(q, c.hay))
    // rank: display-name prefix matches first, then alphabetical
    .sort((a, b) => {
      const ap = (a.name ?? '').toLowerCase().startsWith(ql) ? 0 : 1
      const bp = (b.name ?? '').toLowerCase().startsWith(ql) ? 0 : 1
      return ap - bp || (a.name ?? '').localeCompare(b.name ?? '')
    })

  return NextResponse.json({
    items: matched.slice(0, 8).map((c) => ({ slug: c.slug, name: c.name })),
  })
}
