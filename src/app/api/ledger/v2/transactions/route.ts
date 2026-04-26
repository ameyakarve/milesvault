import { NextResponse } from 'next/server'
import type { TransactionInput } from '@/durable/ledger-v2-types'
import { DEFAULT_LIMIT } from '@/lib/ledger-api'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const GET = withLedger(async ({ client, req }) => {
  const url = new URL(req.url)
  const limit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const offset = Number(url.searchParams.get('offset') ?? 0)
  const result = await client.v2_list(limit, offset)
  return NextResponse.json(result)
})

export const POST = withLedger(async ({ client, req }) => {
  const body = (await req.json().catch((): null => null)) as TransactionInput | null
  if (!body) return NextResponse.json({ errors: ['invalid body'] }, { status: 400 })
  const result = await client.v2_create(body)
  if (result.ok === true) return NextResponse.json(result.transaction, { status: 201 })
  return NextResponse.json({ errors: result.errors }, { status: 400 })
})
