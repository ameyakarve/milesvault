import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const GET = withLedger(async ({ client }) => {
  const result = await client.journal_get()
  return NextResponse.json(result)
})

export const PUT = withLedger(async ({ client, req }) => {
  const body = (await req.json().catch((): null => null)) as { text?: unknown } | null
  if (!body || typeof body.text !== 'string') {
    return NextResponse.json({ errors: ['text required'] }, { status: 400 })
  }
  const result = await client.journal_put(body.text)
  if ('ok' in result && result.ok === false) {
    return NextResponse.json(result, { status: 400 })
  }
  return NextResponse.json(result)
})
