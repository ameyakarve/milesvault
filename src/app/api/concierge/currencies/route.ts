import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { ConciergeDO } from '@/durable/concierge-do'

export const dynamic = 'force-dynamic'

// The searchable target universe for the /points page: every loyalty currency
// (slug + display name). The combobox loads it once and filters client-side.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })

  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CONCIERGE_DO as
    | DurableObjectNamespace<ConciergeDO>
    | undefined
  if (!ns) return new NextResponse('CONCIERGE_DO binding missing', { status: 500 })

  const stub = ns.get(ns.idFromName(session.user.email))
  const currencies = await stub.loyaltyCurrencies()
  return NextResponse.json({ currencies })
}
