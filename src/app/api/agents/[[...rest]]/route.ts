import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { LedgerDO } from '@/durable/ledger-do'

export const dynamic = 'force-dynamic'

// Inline equivalent of `getAgentByName` from the `agents` package. We avoid
// importing from `agents` so that `cloudflare:workers` / `cloudflare:email`
// don't enter the Next.js server bundle.
type NamedAgentStub = DurableObjectStub<LedgerDO> & {
  setName: (name: string, props?: unknown) => Promise<void>
}

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

  const id = ns.idFromName(session.user.email)
  const stub = ns.get(id) as NamedAgentStub
  await stub.setName(session.user.email)
  return stub.fetch(req as unknown as Request)
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
