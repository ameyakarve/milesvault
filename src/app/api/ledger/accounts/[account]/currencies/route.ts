import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const GET = withLedger<{ account: string }>(async ({ client, params }) => {
  const account = decodeURIComponent(params.account)
  const currencies = await client.list_account_currencies(account)
  return NextResponse.json({ currencies })
})
