import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

// Capture items for the Inbox (newest first): everything that arrived from a
// source — statement uploads today; email/paste once F2/F3 land.
export const GET = withLedger(async ({ client }) => {
  return NextResponse.json(await client.list_captures())
})

// Inbox actions. Only dismissal is user-initiated for now; other state
// transitions happen server-side (upload → captured, agent read → extracted).
export const POST = withLedger(async ({ client, req }) => {
  let body: { id?: string; action?: string }
  try {
    body = (await req.json()) as { id?: string; action?: string }
  } catch {
    return new NextResponse('expected JSON body {id, action}', { status: 400 })
  }
  if (!body.id || body.action !== 'dismiss') {
    return new NextResponse('action must be "dismiss" with an id', { status: 400 })
  }
  return NextResponse.json(await client.set_capture_state(body.id, 'dismissed'))
})
