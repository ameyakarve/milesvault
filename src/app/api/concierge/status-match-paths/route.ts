import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { ConciergeDO } from '@/durable/concierge-do'

export const dynamic = 'force-dynamic'

// Data for the Status Match Merry-Go-Round page. Given a FROM status and a TO
// status (each a status-tier or alliance-tier slug), returns the shortest chain
// of status matches connecting them (or found=false).
export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })

  const url = new URL(req.url)
  const from = (url.searchParams.get('from') ?? '').trim()
  const to = (url.searchParams.get('to') ?? '').trim()
  if (!from || !to) {
    return NextResponse.json({ error: 'both from and to statuses are required' }, { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CONCIERGE_DO as
    | DurableObjectNamespace<ConciergeDO>
    | undefined
  if (!ns) return new NextResponse('CONCIERGE_DO binding missing', { status: 500 })

  const stub = ns.get(ns.idFromName(session.user.email))
  const data = await stub.statusMatchPaths(from, to)
  return NextResponse.json(data)
}
