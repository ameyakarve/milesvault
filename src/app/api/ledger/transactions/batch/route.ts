import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'
import { parseArrayOf } from '@/lib/parse-array-of'
import {
  validateBatchCreate,
  validateBatchDelete,
  validateBatchUpdate,
} from '@/lib/ledger-route-validators'

export const dynamic = 'force-dynamic'

export const POST = withLedger(async ({ client, req }) => {
  const body = (await req.json().catch((): null => null)) as { items?: unknown } | null
  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json({ errors: ['invalid body'] }, { status: 400 })
  }
  const result = await client.createBatch(body.items as string[])
  if ('transactions' in result) {
    return NextResponse.json({ transactions: result.transactions }, { status: 201 })
  }
  return NextResponse.json({ errors: result.errors }, { status: 400 })
})

export const PUT = withLedger(
  async ({ client, req }) => {
    const body = (await req.json().catch((): null => null)) as {
      updates?: unknown
      creates?: unknown
      deletes?: unknown
    } | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ errors: ['invalid body'] }, { status: 400 })
    }

    const updates = parseArrayOf('updates', body.updates, validateBatchUpdate)
    const creates = parseArrayOf('creates', body.creates, validateBatchCreate)
    const deletes = parseArrayOf('deletes', body.deletes, validateBatchDelete)
    const shapeErrors = [...updates.errors, ...creates.errors, ...deletes.errors]

    if (shapeErrors.length > 0) {
      return NextResponse.json(
        { errors: [{ section: 'request', index: -1, errors: shapeErrors }] },
        { status: 400 },
      )
    }

    const result = await client.applyBatch({
      updates: updates.values,
      creates: creates.values,
      deletes: deletes.values,
    })
    if ('updated' in result) {
      return NextResponse.json(
        {
          updated: result.updated,
          created: result.created,
          deleted: result.deleted,
        },
        { status: 200 },
      )
    }
    if ('conflicts' in result) {
      return NextResponse.json({ conflicts: result.conflicts }, { status: 409 })
    }
    return NextResponse.json({ errors: result.errors }, { status: 400 })
  },
  {
    mapInputError: (e) =>
      NextResponse.json(
        { errors: [{ section: 'request', index: -1, errors: e.errors }] },
        { status: 400 },
      ),
    mapBindingError: (e) => NextResponse.json({ errors: [e.message] }, { status: 500 }),
    onUnknown: (e) => {
      const name = e instanceof Error ? e.name : typeof e
      const message = e instanceof Error ? e.message : String(e)
      const stack = e instanceof Error ? (e.stack ?? '') : ''
      console.error('[batch-apply] unhandled', { name, message, stack })
      return NextResponse.json({ errors: [`${name}: ${message}`], stack }, { status: 500 })
    },
  },
)
