import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const PUT = withLedger(async ({ client, req }) => {
  const body = (await req.json().catch((): null => null)) as
    | { knownIds?: unknown; buffer?: unknown }
    | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ errors: ['invalid body'] }, { status: 400 })
  }
  const result = await client.replace_buffer({
    knownIds: body.knownIds as never,
    buffer: body.buffer as never,
  })
  if ('ok' in result && result.ok === false) {
    const status = result.error === 'occ_conflict' ? 409 : 400
    return NextResponse.json(result, { status })
  }
  return NextResponse.json(result)
})
