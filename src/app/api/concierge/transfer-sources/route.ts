import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { ConciergeDO } from '@/durable/concierge-do'

export const dynamic = 'force-dynamic'

// The KG-derived "Transfer from" list for the explorer's source picker. Served
// from a SHARED ConciergeDO instance (not per-user) so the ~200-call KG scan is
// computed once globally and cached. The data isn't user-specific.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })

  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CONCIERGE_DO as
    | DurableObjectNamespace<ConciergeDO>
    | undefined
  if (!ns) return new NextResponse('CONCIERGE_DO binding missing', { status: 500 })

  const stub = ns.get(ns.idFromName('award-shared'))
  const sources = await stub.transferSources()
  return NextResponse.json({ sources })
}
