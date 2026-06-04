import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { ConciergeDO } from '@/durable/concierge-do'

export const dynamic = 'force-dynamic'

// Read-only data behind the interactive award-options card. The card (gen-UI)
// fetches this itself with { origin, destination, source } — the agent never
// sees or filters the rows, which is the whole point: it can't drop a routing.
// Returns EVERY programme × routing × cabin combination, card-scoped and costed;
// the client slices/sorts/filters it.
export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })

  const url = new URL(req.url)
  const origin = (url.searchParams.get('origin') ?? '').trim().toUpperCase()
  const destination = (url.searchParams.get('destination') ?? '').trim().toUpperCase()
  const source = (url.searchParams.get('source') ?? '').trim()

  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
    return NextResponse.json(
      { error: 'origin and destination must be 3-letter IATA codes' },
      { status: 400 },
    )
  }
  if (!source) {
    return NextResponse.json(
      { error: 'source (a card or currency name/slug) is required' },
      { status: 400 },
    )
  }

  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CONCIERGE_DO as DurableObjectNamespace<ConciergeDO> | undefined
  if (!ns) return new NextResponse('CONCIERGE_DO binding missing', { status: 500 })

  // Keyed by email — same stable instance per user, so the 7-day route cache
  // warmed by their chat flight-searches is reused. The award data itself is
  // not user-specific (source currency is a param).
  const stub = ns.get(ns.idFromName(session.user.email))
  const data = await stub.awardPlan(origin, destination, source)
  return NextResponse.json(data)
}
