import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth, TEST_USER_EMAIL } from '@/auth'
import type { ChatDO } from '@/durable/chat-do'

export const dynamic = 'force-dynamic'

// E2E benchmark harness (same gates as /api/test/reset): run one editor turn on
// the TEST user's ledger with the real system prompt + tools, return the
// tool-call trace. Remove after benchmarking.
export async function POST(req: Request): Promise<Response> {
  if (!process.env.TEST_USER_TOKEN) return new NextResponse('not found', { status: 404 })
  const session = await auth()
  if (session?.user?.email !== TEST_USER_EMAIL) {
    return new NextResponse('forbidden', { status: 403 })
  }
  const body = (await req.json().catch((): null => null)) as { message?: unknown } | null
  if (!body || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }
  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CHAT_DO as DurableObjectNamespace<ChatDO>
  const stub = ns.get(ns.idFromName(TEST_USER_EMAIL))
  await stub.setName(TEST_USER_EMAIL)
  return NextResponse.json(await stub.__bench_run(body.message))
}
