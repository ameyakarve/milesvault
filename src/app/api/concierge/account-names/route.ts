import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { ConciergeDO } from '@/durable/concierge-do'

export const dynamic = 'force-dynamic'

// KG display names for the user's held accounts (cards, points, status) —
// the Vault and per-account overview overlay these on path-derived labels.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.key) return new NextResponse('unauthorized', { status: 401 })

  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CONCIERGE_DO as
    | DurableObjectNamespace<ConciergeDO>
    | undefined
  if (!ns) return new NextResponse('CONCIERGE_DO binding missing', { status: 500 })

  const stub = ns.get(ns.idFromName(session.user.key))
  return NextResponse.json(await stub.accountNames())
}
