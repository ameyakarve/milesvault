import { NextResponse } from 'next/server'
import type { KnownId } from '@/durable/ledger-types'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const PUT = withLedger(
  async ({ client, req }) => {
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

    const result = await client.replaceBuffer({
      knownIds: parsedKnownIds,
      buffer: body.buffer as string,
    })
    if (result.ok === true) {
      return NextResponse.json({ transactions: result.transactions }, { status: 200 })
    }
    return NextResponse.json({ conflicts: result.conflicts }, { status: 409 })
  },
  {
    onUnknown: (e) => {
      const name = e instanceof Error ? e.name : typeof e
      const message = e instanceof Error ? e.message : String(e)
      const stack = e instanceof Error ? (e.stack ?? '') : ''
      console.error('[replace-buffer] unhandled', { name, message, stack })
      return NextResponse.json({ errors: [`${name}: ${message}`] }, { status: 500 })
    },
  },
)
