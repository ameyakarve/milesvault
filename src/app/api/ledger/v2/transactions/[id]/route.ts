import { NextResponse } from 'next/server'
import type { TransactionInput } from '@/durable/ledger-v2-types'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

function parseId(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

export const GET = withLedger<{ id: string }>(async ({ client, params }) => {
  const id = parseId(params.id)
  if (id === null) return new NextResponse('invalid id', { status: 400 })
  const txn = await client.v2_get(id)
  if (!txn) return new NextResponse('not found', { status: 404 })
  return NextResponse.json(txn)
})

export const PATCH = withLedger<{ id: string }>(async ({ client, req, params }) => {
  const id = parseId(params.id)
  if (id === null) return new NextResponse('invalid id', { status: 400 })
  const body = (await req
    .json()
    .catch((): null => null)) as
    | (TransactionInput & { expected_updated_at?: number })
    | null
  if (!body || typeof body.expected_updated_at !== 'number') {
    return NextResponse.json(
      { errors: ['expected_updated_at required'] },
      { status: 400 },
    )
  }
  const { expected_updated_at, ...input } = body
  const result = await client.v2_update(id, expected_updated_at, input)
  if (result.ok === true) return NextResponse.json(result.transaction)
  if (result.kind === 'not_found') return new NextResponse('not found', { status: 404 })
  if (result.kind === 'conflict') {
    return NextResponse.json(
      { kind: 'conflict', current_updated_at: result.current_updated_at },
      { status: 409 },
    )
  }
  return NextResponse.json({ errors: result.errors }, { status: 400 })
})

export const DELETE = withLedger<{ id: string }>(async ({ client, req, params }) => {
  const id = parseId(params.id)
  if (id === null) return new NextResponse('invalid id', { status: 400 })
  const url = new URL(req.url)
  const raw = url.searchParams.get('expected_updated_at')
  const expected = raw === null ? Number.NaN : Number(raw)
  if (!Number.isInteger(expected)) {
    return NextResponse.json(
      { errors: ['expected_updated_at query param required'] },
      { status: 400 },
    )
  }
  const result = await client.v2_delete(id, expected)
  if (result.ok === true) return new NextResponse(null, { status: 204 })
  if (result.kind === 'not_found') return new NextResponse('not found', { status: 404 })
  return NextResponse.json(
    { kind: 'conflict', current_updated_at: result.current_updated_at },
    { status: 409 },
  )
})
