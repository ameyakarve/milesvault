import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { LedgerDO } from '@/durable/ledger-do'
import { toTransaction } from '@/durable/ledger-types'

export const dynamic = 'force-dynamic'

const MAX_RAW_TEXT_BYTES = 4096
const MAX_BATCH = 100

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
