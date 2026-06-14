import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth, TEST_USER_EMAIL } from '@/auth'
import type { ChatDO } from '@/durable/chat-do'

export const dynamic = 'force-dynamic'

// E2E harness only (same gates as /api/test/reset): run the incorporation engine
// against the TEST user's ledger for a given intent and return the proposed ops
// — verifies the real model's plan/shard + the diff end-to-end, without the chat
// UI. Remove after verification.
export async function POST(req: Request): Promise<Response> {
  if (!process.env.TEST_USER_TOKEN) return new NextResponse('not found', { status: 404 })
  const session = await auth()
  if (session?.user?.email !== TEST_USER_EMAIL) {
    return new NextResponse('forbidden', { status: 403 })
  }
  const body = (await req.json().catch((): null => null)) as { intent?: unknown } | null
  if (!body || typeof body.intent !== 'string') {
    return NextResponse.json({ error: 'intent required' }, { status: 400 })
  }
  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CHAT_DO as DurableObjectNamespace<ChatDO>
  const stub = ns.get(ns.idFromName(TEST_USER_EMAIL))
  await stub.setName(TEST_USER_EMAIL)
  return NextResponse.json(await stub.__test_runIncorporation(body.intent))
}
