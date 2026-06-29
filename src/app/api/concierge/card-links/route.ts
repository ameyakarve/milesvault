import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { ConciergeDO } from '@/durable/concierge-do'

export const dynamic = 'force-dynamic'

// Card → rewards-programme linkage from the knowledge graph: which currency
// each held credit card earns into, matched to the user's rewards account
// with its live balance. Powers the "Earns" card on the per-card overview.
export async function GET(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user?.key) return new NextResponse('unauthorized', { status: 401 })

  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CONCIERGE_DO as
    | DurableObjectNamespace<ConciergeDO>
    | undefined
  if (!ns) return new NextResponse('CONCIERGE_DO binding missing', { status: 500 })

  const stub = ns.get(ns.idFromName(session.user.key))
  const debug = new URL(req.url).searchParams.get('debug') === '1'
  return NextResponse.json(await stub.cardLinks(debug))
}
