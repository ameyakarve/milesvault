import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  LedgerBindingError,
  LedgerInputError,
  getLedgerClient,
} from '@/lib/ledger-api'
import type { KnownId } from '@/durable/ledger-types'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
  const body = (await req.json().catch((): null => null)) as {
    knownIds?: unknown
    buffer?: unknown
  } | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ errors: ['invalid body'] }, { status: 400 })
  }

  const shapeErrors: string[] = []
  const parsedKnownIds: KnownId[] = []
  if (!Array.isArray(body.knownIds)) {
    shapeErrors.push('knownIds must be an array.')
  } else {
    for (let i = 0; i < body.knownIds.length; i++) {
      const k = body.knownIds[i] as Record<string, unknown> | null
      if (!k || typeof k !== 'object') {
        shapeErrors.push(`knownIds[${i}] must be an object.`)
        continue
      }
      if (!Number.isInteger(k.id) || (k.id as number) <= 0) {
        shapeErrors.push(`knownIds[${i}].id must be a positive integer.`)
      }
      if (!Number.isInteger(k.expected_updated_at)) {
        shapeErrors.push(`knownIds[${i}].expected_updated_at must be an integer.`)
      }
      if (typeof k.id === 'number' && typeof k.expected_updated_at === 'number') {
        parsedKnownIds.push({ id: k.id, expected_updated_at: k.expected_updated_at })
      }
    }
  }
  if (typeof body.buffer !== 'string') {
    shapeErrors.push('buffer must be a string.')
  }
  if (shapeErrors.length > 0) {
    return NextResponse.json({ errors: shapeErrors }, { status: 400 })
  }

  try {
    const client = await getLedgerClient(session.user.email)
    const result = await client.replaceBuffer({
      knownIds: parsedKnownIds,
      buffer: body.buffer as string,
    })
    if (result.ok === true) {
      return NextResponse.json({ transactions: result.transactions }, { status: 200 })
    }
    return NextResponse.json({ conflicts: result.conflicts }, { status: 409 })
  } catch (e) {
    if (e instanceof LedgerInputError) {
      return NextResponse.json({ errors: e.errors }, { status: 400 })
    }
    if (e instanceof LedgerBindingError) {
      return new NextResponse(e.message, { status: 500 })
    }
    const name = e instanceof Error ? e.name : typeof e
    const message = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error ? (e.stack ?? '') : ''
    console.error('[replace-buffer] unhandled', { name, message, stack })
    return NextResponse.json({ errors: [`${name}: ${message}`] }, { status: 500 })
  }
}
