import { NextResponse } from 'next/server'
import { MAX_RAW_TEXT_BYTES } from '@/lib/ledger-api'
import type { BatchCreate, BatchDelete, BatchUpdate } from '@/durable/ledger-types'
import { withLedger } from '@/lib/ledger-route-handler'

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

    const shapeErrors: string[] = []
    const enc = new TextEncoder()

    const parsedUpdates: BatchUpdate[] = []
    if (body.updates !== undefined) {
      if (!Array.isArray(body.updates)) {
        shapeErrors.push('updates must be an array.')
      } else {
        for (let i = 0; i < body.updates.length; i++) {
          const u = body.updates[i] as Record<string, unknown> | null
          if (!u || typeof u !== 'object') {
            shapeErrors.push(`updates[${i}] must be an object.`)
            continue
          }
          if (!Number.isInteger(u.id) || (u.id as number) <= 0) {
            shapeErrors.push(`updates[${i}].id must be a positive integer.`)
          }
          if (typeof u.raw_text !== 'string') {
            shapeErrors.push(`updates[${i}].raw_text must be a string.`)
          } else if (enc.encode(u.raw_text).byteLength > MAX_RAW_TEXT_BYTES) {
            shapeErrors.push(`updates[${i}].raw_text exceeds ${MAX_RAW_TEXT_BYTES} bytes.`)
          }
          if (!Number.isInteger(u.expected_updated_at)) {
            shapeErrors.push(`updates[${i}].expected_updated_at must be an integer.`)
          }
          if (
            typeof u.id === 'number' &&
            typeof u.raw_text === 'string' &&
            typeof u.expected_updated_at === 'number'
          ) {
            parsedUpdates.push({
              id: u.id,
              raw_text: u.raw_text,
              expected_updated_at: u.expected_updated_at,
            })
          }
        }
      }
    }

    const parsedCreates: BatchCreate[] = []
    if (body.creates !== undefined) {
      if (!Array.isArray(body.creates)) {
        shapeErrors.push('creates must be an array.')
      } else {
        for (let i = 0; i < body.creates.length; i++) {
          const c = body.creates[i] as Record<string, unknown> | null
          if (!c || typeof c !== 'object') {
            shapeErrors.push(`creates[${i}] must be an object.`)
            continue
          }
          if (typeof c.raw_text !== 'string') {
            shapeErrors.push(`creates[${i}].raw_text must be a string.`)
            continue
          }
          if (enc.encode(c.raw_text).byteLength > MAX_RAW_TEXT_BYTES) {
            shapeErrors.push(`creates[${i}].raw_text exceeds ${MAX_RAW_TEXT_BYTES} bytes.`)
            continue
          }
          parsedCreates.push({ raw_text: c.raw_text })
        }
      }
    }

    const parsedDeletes: BatchDelete[] = []
    if (body.deletes !== undefined) {
      if (!Array.isArray(body.deletes)) {
        shapeErrors.push('deletes must be an array.')
      } else {
        for (let i = 0; i < body.deletes.length; i++) {
          const d = body.deletes[i] as Record<string, unknown> | null
          if (!d || typeof d !== 'object') {
            shapeErrors.push(`deletes[${i}] must be an object.`)
            continue
          }
          if (!Number.isInteger(d.id) || (d.id as number) <= 0) {
            shapeErrors.push(`deletes[${i}].id must be a positive integer.`)
          }
          if (!Number.isInteger(d.expected_updated_at)) {
            shapeErrors.push(`deletes[${i}].expected_updated_at must be an integer.`)
          }
          if (typeof d.id === 'number' && typeof d.expected_updated_at === 'number') {
            parsedDeletes.push({ id: d.id, expected_updated_at: d.expected_updated_at })
          }
        }
      }
    }

    if (shapeErrors.length > 0) {
      return NextResponse.json(
        { errors: [{ section: 'request', index: -1, errors: shapeErrors }] },
        { status: 400 },
      )
    }

    const result = await client.applyBatch({
      updates: parsedUpdates,
      creates: parsedCreates,
      deletes: parsedDeletes,
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
