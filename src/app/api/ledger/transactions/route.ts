import { NextResponse } from 'next/server'
import { DEFAULT_LIMIT } from '@/lib/ledger-api'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const GET = withLedger(async ({ client, req }) => {
  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''
  const rawLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const rawOffset = Number(url.searchParams.get('offset') ?? 0)
  const result = await client.search(q, rawLimit, rawOffset)
  return NextResponse.json(result)
})

export const POST = withLedger(async ({ client, req }) => {
  const body = (await req.json().catch((): null => null)) as { raw_text?: unknown } | null
  if (!body || typeof body.raw_text !== 'string') {
    return NextResponse.json({ errors: ['invalid body'] }, { status: 400 })
  }
  const result = await client.create(body.raw_text)
  if ('transaction' in result) return NextResponse.json(result.transaction, { status: 201 })
  return NextResponse.json({ errors: result.errors }, { status: 400 })
})
