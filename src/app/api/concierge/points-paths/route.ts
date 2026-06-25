import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { ConciergeDO } from '@/durable/concierge-do'

export const dynamic = 'force-dynamic'

// Data for the /points page — the backward dual of /explore. Given a target
// loyalty currency (slug or free-text name) and an optional amount, returns the
// React-Flow graph of every way to accumulate it (feeder currencies + the cards
// that earn them), each source tagged with its cheapest ratio. All filtering is
// the client's job — this computes the universe upstream of the target.
export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })

  const url = new URL(req.url)
  const target = (url.searchParams.get('target') ?? '').trim()
  if (!target) {
    return NextResponse.json({ error: 'target (a loyalty currency) is required' }, { status: 400 })
  }
  const amountRaw = url.searchParams.get('amount')
  const amount = amountRaw != null && amountRaw !== '' ? Number(amountRaw) : undefined
  if (amount != null && !Number.isFinite(amount)) {
    return NextResponse.json({ error: 'amount must be a number' }, { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CONCIERGE_DO as
    | DurableObjectNamespace<ConciergeDO>
    | undefined
  if (!ns) return new NextResponse('CONCIERGE_DO binding missing', { status: 500 })

  const stub = ns.get(ns.idFromName(session.user.email))
  const data = await stub.pointsPaths(target, amount)
  return NextResponse.json(data)
}
