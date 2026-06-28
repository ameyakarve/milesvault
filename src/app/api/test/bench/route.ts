import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth, TEST_USER_EMAIL } from '@/auth'
import { getLedgerClient } from '@/lib/ledger-api'
import type { ChatDO } from '@/durable/chat-do'
import type { ConciergeDO } from '@/durable/concierge-do'

export const dynamic = 'force-dynamic'

// E2E benchmark harness (same gates as /api/test/reset): seed the TEST user's
// ledger, then run one editor turn with the real system prompt + tools, and
// return the tool-call trace. The optional `seed` (a beancount buffer) makes
// each eval case self-contained — promptfoo POSTs {seed, message} per case, so
// no separate reset/seed round-trips. NOTE: one shared test ledger, so the
// eval runner MUST run cases serially (concurrency 1). Remove after benchmarking.
export async function POST(req: Request): Promise<Response> {
  if (!process.env.TEST_USER_TOKEN) return new NextResponse('not found', { status: 404 })
  const session = await auth()
  if (session?.user?.email !== TEST_USER_EMAIL) {
    return new NextResponse('forbidden', { status: 403 })
  }
  const body = (await req.json().catch((): null => null)) as {
    message?: unknown
    seed?: unknown
    agent?: unknown
  } | null
  if (!body || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }
  const agent = body.agent === 'concierge' ? 'concierge' : 'editor'
  // Reset + seed the ledger (when a seed is supplied) before the turn. Same
  // store the bench turn reads from (LedgerDO keyed by the test user email).
  if (typeof body.seed === 'string') {
    const client = await getLedgerClient(TEST_USER_EMAIL)
    await client.clear()
    if (body.seed.trim()) {
      await client.replace_buffer({ knownIds: [], buffer: body.seed } as never)
    }
  }
  const { env } = await getCloudflareContext({ async: true })
  if (agent === 'concierge') {
    const ns = (env as Cloudflare.Env).CONCIERGE_DO as DurableObjectNamespace<ConciergeDO>
    const stub = ns.get(ns.idFromName(TEST_USER_EMAIL))
    await stub.setName(TEST_USER_EMAIL)
    return NextResponse.json(await stub.__bench_run(body.message))
  }
  const ns = (env as Cloudflare.Env).CHAT_DO as DurableObjectNamespace<ChatDO>
  const stub = ns.get(ns.idFromName(TEST_USER_EMAIL))
  await stub.setName(TEST_USER_EMAIL)
  return NextResponse.json(await stub.__bench_run(body.message))
}
