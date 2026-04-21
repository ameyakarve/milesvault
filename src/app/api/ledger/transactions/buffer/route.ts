import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'
import { parseArrayOf } from '@/lib/parse-array-of'
import { validateKnownId } from '@/lib/ledger-route-validators'

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

    const knownIds =
      body.knownIds === undefined
        ? { values: [], errors: ['knownIds must be an array.'] }
        : parseArrayOf('knownIds', body.knownIds, validateKnownId)
    const shapeErrors = [...knownIds.errors]
    if (typeof body.buffer !== 'string') {
      shapeErrors.push('buffer must be a string.')
    }
    if (shapeErrors.length > 0) {
      return NextResponse.json({ errors: shapeErrors }, { status: 400 })
    }

    const result = await client.replaceBuffer({
      knownIds: knownIds.values,
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
