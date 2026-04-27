import { NextResponse } from 'next/server'
import { DEFAULT_LIMIT } from '@/lib/ledger-api'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const GET = withLedger<{ account: string }>(async ({ client, req, params }) => {
  const account = decodeURIComponent(params.account)
  const url = new URL(req.url)
  const limit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const offset = Number(url.searchParams.get('offset') ?? 0)
  const result = await client.v2_list_by_account(account, limit, offset)
  return NextResponse.json(result)
})
