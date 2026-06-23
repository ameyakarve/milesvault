import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { ConciergeDO } from '@/durable/concierge-do'

export const dynamic = 'force-dynamic'

// Data for the /explore page. Given a city pair it returns the full option set
// (every routing × programme × cabin) with each programme's own published
// miles, plus the distinct airlines. All filtering/sorting is the client's job
// — this just computes the universe. Funding/transfers live on /points.
export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })

  const url = new URL(req.url)
  const origin = (url.searchParams.get('origin') ?? '').trim().toUpperCase()
  const destination = (url.searchParams.get('destination') ?? '').trim().toUpperCase()

  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
    return NextResponse.json(
      { error: 'origin and destination must be 3-letter IATA codes' },
      { status: 400 },
    )
  }

  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CONCIERGE_DO as
    | DurableObjectNamespace<ConciergeDO>
    | undefined
  if (!ns) return new NextResponse('CONCIERGE_DO binding missing', { status: 500 })

  const stub = ns.get(ns.idFromName(session.user.email))
  const data = await stub.awardExplore(origin, destination)
  return NextResponse.json(data)
}
