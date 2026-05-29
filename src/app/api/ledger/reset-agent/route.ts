import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const POST = withLedger(async ({ client }) => {
  await client.reset_active_agent()
  return NextResponse.json({ ok: true })
})
