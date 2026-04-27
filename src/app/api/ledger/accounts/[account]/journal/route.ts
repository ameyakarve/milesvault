import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const GET = withLedger<{ account: string }>(async ({ client, req, params }) => {
  const account = decodeURIComponent(params.account)
  const url = new URL(req.url)
  const currency = url.searchParams.get('currency')
  const result = currency
    ? await client.journal_get_for_account_currency(account, currency)
    : await client.journal_get_for_account(account)
  return NextResponse.json(result)
})
