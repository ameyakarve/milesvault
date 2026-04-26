import { NextResponse } from 'next/server'
import { DEFAULT_LIMIT } from '@/lib/ledger-api'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const GET = withLedger(async ({ client, req }) => {
  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''
  const limit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const offset = Number(url.searchParams.get('offset') ?? 0)
  const result = await client.v2_search(q, limit, offset)
  return NextResponse.json(result)
})
