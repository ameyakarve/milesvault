import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { LedgerDO } from '@/durable/ledger-do'
import { toTransaction } from '@/durable/ledger-types'
import { parseQuery } from '@/durable/search-parser'

export const dynamic = 'force-dynamic'

const MAX_RAW_TEXT_BYTES = 4096
const MAX_QUERY_LENGTH = 1024
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

async function getStub(email: string) {
  const { env } = await getCloudflareContext({ async: true })
  const ns = env.LEDGER_DO as DurableObjectNamespace<LedgerDO> | undefined
  if (!ns) return null
  return ns.get(ns.idFromName(email))
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''
  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ errors: [`q exceeds ${MAX_QUERY_LENGTH} chars.`] }, { status: 400 })
  }
  const rawLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const rawOffset = Number(url.searchParams.get('offset') ?? 0)
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.floor(rawOffset), 0) : 0

  const stub = await getStub(session.user.email)
  if (!stub) return new NextResponse('LEDGER_DO binding missing', { status: 500 })

  const filter = parseQuery(q)
  const { rows, total } = await stub.search(filter, limit, offset)
  return NextResponse.json({
    rows: rows.map(toTransaction),
    total,
    limit,
    offset,
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
  const body = (await req.json().catch((): null => null)) as { raw_text?: unknown } | null
  if (!body || typeof body.raw_text !== 'string') {
    return NextResponse.json({ errors: ['invalid body'] }, { status: 400 })
  }
  if (new TextEncoder().encode(body.raw_text).byteLength > MAX_RAW_TEXT_BYTES) {
    return NextResponse.json(
      { errors: [`raw_text exceeds ${MAX_RAW_TEXT_BYTES} bytes.`] },
      { status: 400 },
    )
  }
  const stub = await getStub(session.user.email)
  if (!stub) return new NextResponse('LEDGER_DO binding missing', { status: 500 })
  const result = await stub.create(body.raw_text)
  if ('row' in result) return NextResponse.json(toTransaction(result.row), { status: 201 })
  return NextResponse.json({ errors: result.errors }, { status: 400 })
}
