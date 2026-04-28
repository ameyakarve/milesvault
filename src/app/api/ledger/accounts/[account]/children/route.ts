import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const GET = withLedger<{ account: string }>(async ({ client, params }) => {
  const account = decodeURIComponent(params.account)
  const children = await client.list_account_children(account)
  return NextResponse.json({ children })
})
