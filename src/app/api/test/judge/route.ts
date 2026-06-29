import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth, isTestEmail } from '@/auth'
import type { ChatDO } from '@/durable/chat-do'

export const dynamic = 'force-dynamic'

// Eval-bench LLM-judge (same gates as /api/test/bench): grade one turn's output
// against a case rubric using a stronger model. Remove after benchmarking.
export async function POST(req: Request): Promise<Response> {
  if (!process.env.TEST_USER_TOKEN) return new NextResponse('not found', { status: 404 })
  const session = await auth()
  const email = session?.user?.key
  if (!isTestEmail(email)) {
    return new NextResponse('forbidden', { status: 403 })
  }
  const body = (await req.json().catch((): null => null)) as { prompt?: unknown } | null
  if (!body || typeof body.prompt !== 'string') {
    return NextResponse.json({ error: 'prompt required' }, { status: 400 })
  }
  // Key the judge DO per account so judging doesn't serialize on one DO across
  // parallel lanes (the judge is stateless — any test email works).
  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CHAT_DO as DurableObjectNamespace<ChatDO>
  const stub = ns.get(ns.idFromName(email))
  await stub.setName(email)
  return NextResponse.json(await stub.__bench_judge(body.prompt))
}
