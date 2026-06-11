import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { kbHttpOverFetch } from '@/durable/agents/tools/concierge/kb-tools'

export const dynamic = 'force-dynamic'

// Typeahead over the knowledge graph's credit-card nodes — powers the
// add_card gen-UI picker in the editor chat.
export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ items: [] })

  const { env } = await getCloudflareContext({ async: true })
  const kb = kbHttpOverFetch('https://kb', (env as Cloudflare.Env).KB)
  const r = (await kb.resolve(q, { prefix: 'cc', limit: 8 })) as {
    items?: Array<{ slug: string; display_name: string | null }>
  }
  return NextResponse.json({
    items: (r.items ?? []).map((i) => ({ slug: i.slug, name: i.display_name })),
  })
}
