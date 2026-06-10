import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

// Capture items for the Inbox (newest first): everything that arrived from a
// source — statement uploads today; email/paste once F2/F3 land.
export const GET = withLedger(async ({ client }) => {
  return NextResponse.json(await client.list_captures())
})
