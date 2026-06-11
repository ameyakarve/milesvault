import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth, TEST_USER_EMAIL } from '@/auth'
import { getLedgerClient } from '@/lib/ledger-api'
import type { ChatDO } from '@/durable/chat-do'

export const dynamic = 'force-dynamic'

// E2E harness only: wipe the TEST user's world back to empty. Three gates —
// the TEST_USER_TOKEN secret must exist in this environment (production
// never sets it), the session must BE the test user (the wrapped auth()
// maps the token cookie), and it touches nothing but that user's DOs.
export async function POST(): Promise<Response> {
  if (!process.env.TEST_USER_TOKEN) return new NextResponse('not found', { status: 404 })
  const session = await auth()
  if (session?.user?.email !== TEST_USER_EMAIL) {
    return new NextResponse('forbidden', { status: 403 })
  }
  const client = await getLedgerClient(TEST_USER_EMAIL)
  await client.clear()
  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CHAT_DO as DurableObjectNamespace<ChatDO> | undefined
  if (ns) {
    const stub = ns.get(ns.idFromName(TEST_USER_EMAIL))
    await stub.setName(TEST_USER_EMAIL)
    await stub.destroyThread()
  }
  return NextResponse.json({ ok: true })
}
