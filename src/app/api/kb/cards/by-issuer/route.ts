import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { kbHttpOverFetch } from '@/durable/agents/tools/concierge/kb-tools'

export const dynamic = 'force-dynamic'

// Every card a bank issues — ISSUED_BY incoming on bank/<issuer>. Powers the
// add-card form's Card dropdown once an Issuer is picked.
export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
  const issuer = req.nextUrl.searchParams.get('issuer')?.trim()
  if (!issuer) return NextResponse.json({ items: [] })

  const { env } = await getCloudflareContext({ async: true })
  const kb = kbHttpOverFetch('https://kb', (env as Cloudflare.Env).KB)
  const r = (await kb.related(`bank/${issuer}`, {
    edge_type: 'ISSUED_BY',
    direction: 'incoming',
  })) as { items?: Array<{ other: string; display_name?: string | null }> }
  // ISSUED_BY edges don't carry display names; derive a readable label from
  // the slug (cc/axis-magnus-burgundy → "Axis Magnus Burgundy").
  const pretty = (slug: string) =>
    slug
      .replace(/^cc\//, '')
      .split('-')
      .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
      .join(' ')
  const items = (r.items ?? [])
    .filter((i) => i.other.startsWith('cc/'))
    .map((i) => ({ slug: i.other, name: i.display_name ?? pretty(i.other) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return NextResponse.json({ items })
}
