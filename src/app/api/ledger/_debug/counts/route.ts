import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const GET = withLedger(async ({ client }) => {
  const counts = await client._debug_counts()
  return NextResponse.json(counts)
})
