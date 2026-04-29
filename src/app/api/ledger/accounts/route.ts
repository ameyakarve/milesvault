import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const GET = withLedger(async ({ client, req }) => {
  const url = new URL(req.url)
  const asOf = url.searchParams.get('as_of') ?? new Date().toISOString().slice(0, 10)
  const rows = await client.list_account_summaries(asOf)
  return NextResponse.json({ rows })
})
