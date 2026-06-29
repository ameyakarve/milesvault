import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { kbHttpOverFetch } from '@/durable/agents/tools/concierge/kb-tools'
import { fetchCardGuide } from '@/durable/agents/tools/editor/card-guide'

export const dynamic = 'force-dynamic'

// Full card derivation (issuer, reward pool, ticker, rate notes) for the
// add_card picker — same fetchCardGuide the agents use.
export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth()
  if (!session?.user?.key) return new NextResponse('unauthorized', { status: 401 })
  const name = req.nextUrl.searchParams.get('name')?.trim()
  if (!name) return new NextResponse('name required', { status: 400 })

  const { env } = await getCloudflareContext({ async: true })
  const kb = kbHttpOverFetch('https://kb', (env as Cloudflare.Env).KB)
  return NextResponse.json(await fetchCardGuide(kb, name))
}
