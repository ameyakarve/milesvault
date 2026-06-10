import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { ChatDO } from '@/durable/chat-do'

export const dynamic = 'force-dynamic'

// Escape hatch: hard-reset the caller's editor ChatDO (storage + alarms),
// killing zombie turns the UI can't clear. ?thread=<captureId> resets that
// item's thread instead. Names derive from the session email, so a user can
// only ever reset their own instances.
export async function POST(req: NextRequest): Promise<Response> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return new NextResponse('unauthorized', { status: 401 })

  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CHAT_DO as DurableObjectNamespace<ChatDO> | undefined
  if (!ns) return new NextResponse('CHAT_DO binding missing', { status: 500 })

  const thread = req.nextUrl.searchParams.get('thread')
  if (thread && !/^[A-Za-z0-9_-]{1,80}$/.test(thread)) {
    return new NextResponse('invalid thread id', { status: 400 })
  }
  const name = thread ? `${email}::${thread}` : email
  await ns.get(ns.idFromName(name)).destroyThread()
  return NextResponse.json({ ok: true, reset: thread ?? 'editor' })
}
