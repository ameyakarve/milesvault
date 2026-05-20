import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { LedgerDO } from '@/durable/ledger-do'

export const dynamic = 'force-dynamic'

async function handle(req: NextRequest): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) {
    return new NextResponse('unauthorized', { status: 401 })
  }
  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).LEDGER_DO as
    | DurableObjectNamespace<LedgerDO>
    | undefined
  if (!ns) return new NextResponse('LEDGER_DO binding missing', { status: 500 })

  // Lazy-import so Next's build-time page-data collection (Node ESM loader)
  // doesn't evaluate `cloudflare:workers` / `cloudflare:email` schemes that
  // the `agents` package imports at the top level.
  const { getAgentByName } = await import('agents')
  const stub = await getAgentByName(
    ns as unknown as Parameters<typeof getAgentByName>[0],
    session.user.email,
  )
  return stub.fetch(req as unknown as Request)
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
