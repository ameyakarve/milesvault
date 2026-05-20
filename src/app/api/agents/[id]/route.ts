import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { AgentDO } from '@/durable/agent-do'

export const dynamic = 'force-dynamic'

async function handle(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })

  // [id] is reserved for future multi-thread sessions. v1 routes everyone to
  // their own AgentDO keyed by email; [id] is accepted but ignored.
  await ctx.params

  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).AGENT_DO as
    | DurableObjectNamespace<AgentDO>
    | undefined
  if (!ns) return new NextResponse('AGENT_DO binding missing', { status: 500 })

  const stub = ns.get(ns.idFromName(session.user.email))
  return stub.fetch(req)
}

export const GET = handle
export const POST = handle
