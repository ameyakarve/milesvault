import { NextResponse } from 'next/server'
import { parseText } from '@/lib/beancount/v2-ast'
import { assertDirectiveKind } from '@/lib/ledger-api'
import { withLedger } from '@/lib/ledger-route-handler'
import type { DirectiveKind } from '@/durable/ledger-v2-types'

export const dynamic = 'force-dynamic'

function parseId(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

type Params = { kind: string; id: string }

export const GET = withLedger<Params>(async ({ client, params }) => {
  const id = parseId(params.id)
  if (id === null) return new NextResponse('invalid id', { status: 400 })
  assertDirectiveKind(params.kind)
  const out = await client.v2_directive_get(params.kind as DirectiveKind, id)
  if (!out) return new NextResponse('not found', { status: 404 })
  return NextResponse.json(out)
})

export const PATCH = withLedger<Params>(async ({ client, req, params }) => {
  const id = parseId(params.id)
  if (id === null) return new NextResponse('invalid id', { status: 400 })
  assertDirectiveKind(params.kind)
  const kind = params.kind as DirectiveKind
  const body = (await req.json().catch((): null => null)) as
    | { raw_text?: unknown; expected_updated_at?: unknown }
    | null
  if (
    !body ||
    typeof body.raw_text !== 'string' ||
    typeof body.expected_updated_at !== 'number'
  ) {
    return NextResponse.json(
      { errors: ['raw_text and expected_updated_at required'] },
      { status: 400 },
    )
  }
  const parsed = parseText(body.raw_text)
  if (parsed.ok === false) return NextResponse.json({ errors: parsed.errors }, { status: 400 })
  if (parsed.directives.length !== 1) {
    return NextResponse.json(
      { errors: ['expected exactly one directive in raw_text'] },
      { status: 400 },
    )
  }
  const result = await client.v2_directive_update(
    kind,
    id,
    body.expected_updated_at,
    parsed.directives[0],
  )
  if (result.ok === true) return NextResponse.json(result.directive)
  if (result.kind === 'not_found') return new NextResponse('not found', { status: 404 })
  if (result.kind === 'conflict') {
    return NextResponse.json(
      { kind: 'conflict', current_updated_at: result.current_updated_at },
      { status: 409 },
    )
  }
  if (result.kind === 'wrong_kind') {
    return NextResponse.json(
      {
        errors: [
          `directive kind '${result.actual}' does not match url kind '${result.expected}'`,
        ],
      },
      { status: 400 },
    )
  }
  return NextResponse.json({ errors: result.errors }, { status: 400 })
})

export const DELETE = withLedger<Params>(async ({ client, req, params }) => {
  const id = parseId(params.id)
  if (id === null) return new NextResponse('invalid id', { status: 400 })
  assertDirectiveKind(params.kind)
  const kind = params.kind as DirectiveKind
  const url = new URL(req.url)
  const raw = url.searchParams.get('expected_updated_at')
  const expected = raw === null ? Number.NaN : Number(raw)
  if (!Number.isInteger(expected)) {
    return NextResponse.json(
      { errors: ['expected_updated_at query param required'] },
      { status: 400 },
    )
  }
  const result = await client.v2_directive_delete(kind, id, expected)
  if (result.ok === true) return new NextResponse(null, { status: 204 })
  if (result.kind === 'not_found') return new NextResponse('not found', { status: 404 })
  return NextResponse.json(
    { kind: 'conflict', current_updated_at: result.current_updated_at },
    { status: 409 },
  )
})
