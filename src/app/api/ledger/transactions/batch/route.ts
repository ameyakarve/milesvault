import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { LedgerDO } from '@/durable/ledger-do'
import {
  toTransaction,
  type BatchUpdate,
  type BatchCreate,
  type BatchDelete,
} from '@/durable/ledger-types'

export const dynamic = 'force-dynamic'

const MAX_RAW_TEXT_BYTES = 4096
const MAX_BATCH = 100
const MAX_APPLY_ITEMS = 10

async function getStub(email: string) {
  const { env } = await getCloudflareContext({ async: true })
  const ns = env.LEDGER_DO as DurableObjectNamespace<LedgerDO> | undefined
  if (!ns) return null
  return ns.get(ns.idFromName(email))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
  const body = (await req.json().catch((): null => null)) as { items?: unknown } | null
  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json({ errors: ['invalid body'] }, { status: 400 })
  }
  const items = body.items
  if (items.length === 0) {
    return NextResponse.json({ errors: ['items must be non-empty'] }, { status: 400 })
  }
  if (items.length > MAX_BATCH) {
    return NextResponse.json(
      { errors: [`items exceeds max of ${MAX_BATCH}.`] },
      { status: 400 },
    )
  }
  const enc = new TextEncoder()
  for (let i = 0; i < items.length; i++) {
    const v = items[i]
    if (typeof v !== 'string') {
      return NextResponse.json(
        { errors: [`items[${i}] must be a string.`] },
        { status: 400 },
      )
    }
    if (enc.encode(v).byteLength > MAX_RAW_TEXT_BYTES) {
      return NextResponse.json(
        { errors: [`items[${i}] exceeds ${MAX_RAW_TEXT_BYTES} bytes.`] },
        { status: 400 },
      )
    }
  }
  const stub = await getStub(session.user.email)
  if (!stub) return new NextResponse('LEDGER_DO binding missing', { status: 500 })
  const result = await stub.createBatch(items as string[])
  if ('rows' in result) {
    return NextResponse.json(
      { transactions: result.rows.map(toTransaction) },
      { status: 201 },
    )
  }
  return NextResponse.json({ errors: result.errors }, { status: 400 })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
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

  const total = parsedUpdates.length + parsedCreates.length + parsedDeletes.length
  if (total === 0 && shapeErrors.length === 0) {
    shapeErrors.push('At least one of updates/creates/deletes must be non-empty.')
  }
  if (total > MAX_APPLY_ITEMS) {
    shapeErrors.push(`Total items exceeds max of ${MAX_APPLY_ITEMS}.`)
  }
  if (shapeErrors.length > 0) {
    return NextResponse.json(
      { errors: [{ section: 'request', index: -1, errors: shapeErrors }] },
      { status: 400 },
    )
  }

  const stub = await getStub(session.user.email)
  if (!stub) return new NextResponse('LEDGER_DO binding missing', { status: 500 })
  const result = await stub.applyBatch({
    updates: parsedUpdates,
    creates: parsedCreates,
    deletes: parsedDeletes,
  })
  if ('updated' in result) {
    return NextResponse.json(
      {
        updated: result.updated.map(toTransaction),
        created: result.created.map(toTransaction),
        deleted: result.deleted,
      },
      { status: 200 },
    )
  }
  if (result.kind === 'conflict') {
    return NextResponse.json({ conflicts: result.conflicts }, { status: 409 })
  }
  return NextResponse.json({ errors: result.errors }, { status: 400 })
}
