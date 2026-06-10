import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { withLedger } from '@/lib/ledger-route-handler'
import type { ChatDO } from '@/durable/chat-do'

export const dynamic = 'force-dynamic'

// Capture items for the Inbox (newest first): everything that arrived from a
// source — statement uploads today; email/paste once F2/F3 land.
export const GET = withLedger(async ({ client }) => {
  return NextResponse.json(await client.list_captures())
})

// Inbox actions: 'dismiss' (Inbox button) and 'post' (the chat marks the
// capture done when the statement's draft batch is approved). Other
// transitions happen server-side (upload → captured, agent read → extracted).
export const POST = withLedger(async ({ client, req, email }) => {
  let body: { id?: string; action?: string }
  try {
    body = (await req.json()) as { id?: string; action?: string }
  } catch {
    return new NextResponse('expected JSON body {id, action}', { status: 400 })
  }
  const state = body.action === 'dismiss' ? 'dismissed' : body.action === 'post' ? 'posted' : null
  if (!body.id || !state) {
    return new NextResponse('action must be "dismiss" or "post", with an id', { status: 400 })
  }
  const result = await client.set_capture_state(body.id, state)
  // Cost hygiene: a closed item's chat thread is dead weight — wipe its DO
  // storage in the background. Safe even if the thread was never opened
  // (destroying an empty DO is a no-op).
  const { env, ctx } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CHAT_DO as DurableObjectNamespace<ChatDO> | undefined
  if (ns) {
    const threadName = `${email}::${body.id}`
    ctx.waitUntil(
      ns
        .get(ns.idFromName(threadName))
        .destroyThread()
        .then((): undefined => undefined)
        .catch((e): undefined => {
          console.warn('[captures] thread cleanup failed', { id: body.id, err: String(e) })
          return undefined
        }),
    )
  }
  return NextResponse.json(result)
})
