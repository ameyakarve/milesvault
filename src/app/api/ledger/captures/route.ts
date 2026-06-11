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
  const action = body.action
  if (!body.id || !['dismiss', 'post', 'delete', 'redraft'].includes(action ?? '')) {
    return new NextResponse('action must be dismiss|post|delete|redraft, with an id', {
      status: 400,
    })
  }
  const { env, ctx } = await getCloudflareContext({ async: true })
  // Re-run the background drafter (errored-state retry). Source-agnostic.
  if (action === 'redraft') {
    const chatNs = (env as Cloudflare.Env).CHAT_DO as DurableObjectNamespace<ChatDO> | undefined
    if (!chatNs) return new NextResponse('CHAT_DO binding missing', { status: 500 })
    const redraftStub = chatNs.get(chatNs.idFromName(email))
    ctx.waitUntil(
      redraftStub
        .setName(email)
        .then(() => redraftStub.draftStatementAsync(body.id))
        .then((): undefined => undefined)
        .catch((e): undefined => {
          console.error('[captures] redraft failed', { id: body.id, err: String(e) })
          return undefined
        }),
    )
    return NextResponse.json({ ok: true })
  }
  const result =
    action === 'delete'
      ? await client.delete_capture(body.id)
      : await client.set_capture_state(body.id, action === 'dismiss' ? 'dismissed' : 'posted')
  // Cost hygiene: a closed item's chat thread is dead weight — wipe its DO
  // storage in the background. Safe even if the thread was never opened
  // (destroying an empty DO is a no-op).
  const ns = (env as Cloudflare.Env).CHAT_DO as DurableObjectNamespace<ChatDO> | undefined
  if (ns) {
    const threadName = `${email}::${body.id}`
    const threadStub = ns.get(ns.idFromName(threadName))
    ctx.waitUntil(
      threadStub
        .setName(threadName)
        .then(() => threadStub.destroyThread())
        .then((): undefined => undefined)
        .catch((e): undefined => {
          console.warn('[captures] thread cleanup failed', { id: body.id, err: String(e) })
          return undefined
        }),
    )
  }
  return NextResponse.json(result)
})
