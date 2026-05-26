import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const GET = withLedger(async ({ client }) => {
  const snap = await client.ledger_snapshot()
  const accounts = snap.accounts
    .filter((a) => a.close_date == null)
    .map((a) => a.account)
  return NextResponse.json({ accounts })
})
