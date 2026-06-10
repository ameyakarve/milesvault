import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

// Capture items for the Inbox (newest first): everything that arrived from a
// source — statement uploads today; email/paste once F2/F3 land.
export const GET = withLedger(async ({ client }) => {
  return NextResponse.json(await client.list_captures())
})

// Inbox actions: 'dismiss' (Inbox button) and 'post' (the chat marks the
// capture done when the statement's draft batch is approved). Other
// transitions happen server-side (upload → captured, agent read → extracted).
export const POST = withLedger(async ({ client, req }) => {
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
  return NextResponse.json(await client.set_capture_state(body.id, state))
})
