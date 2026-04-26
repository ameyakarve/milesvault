import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const GET = withLedger(async ({ client }) => {
  const accounts = await client.v2_listAccounts()
  return NextResponse.json({ accounts })
})
