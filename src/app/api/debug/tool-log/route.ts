import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { ChatDO } from '@/durable/chat-do'

export const dynamic = 'force-dynamic'

// Structured tool-invocation log from the editor agents (ChatDO) — the
// observability loop for tuning drafting. ?limit=200 for more.
export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth()
  if (!session?.user?.key) return new NextResponse('unauthorized', { status: 401 })

  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CHAT_DO as DurableObjectNamespace<ChatDO> | undefined
  if (!ns) return new NextResponse('CHAT_DO binding missing', { status: 500 })

  const stub = ns.get(ns.idFromName(session.user.key))
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 100)
  return NextResponse.json(await stub.list_tool_log(Number.isFinite(limit) ? limit : 100))
}
