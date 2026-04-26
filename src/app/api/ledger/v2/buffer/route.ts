import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const GET = withLedger(async ({ client }) => {
  const max_updated_at = await client.v2_max_updated_at()
  return NextResponse.json({ max_updated_at })
})

export const PUT = withLedger(async ({ client, req }) => {
  const body = (await req.json().catch((): null => null)) as {
    buffer?: unknown
    expected_max_updated_at?: unknown
  } | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ errors: ['invalid body'] }, { status: 400 })
  }
  if (typeof body.buffer !== 'string') {
    return NextResponse.json({ errors: ['buffer must be a string.'] }, { status: 400 })
  }
  if (!Number.isInteger(body.expected_max_updated_at)) {
    return NextResponse.json(
      { errors: ['expected_max_updated_at must be an integer.'] },
      { status: 400 },
    )
  }
  const result = await client.v2_replace_all(
    body.buffer,
    body.expected_max_updated_at as number,
  )
  if (result.ok === true) {
    return NextResponse.json(
      { directives: result.directives, max_updated_at: result.max_updated_at },
      { status: 200 },
    )
  }
  if (result.kind === 'conflict') {
    return NextResponse.json(
      { kind: 'conflict', current_max_updated_at: result.current_max_updated_at },
      { status: 409 },
    )
  }
  return NextResponse.json({ kind: 'validation', errors: result.errors }, { status: 400 })
})
