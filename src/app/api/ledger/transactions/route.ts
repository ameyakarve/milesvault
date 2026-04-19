import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  DEFAULT_LIMIT,
  LedgerBindingError,
  LedgerInputError,
  getLedgerClient,
} from '@/lib/ledger-api'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''
  const rawLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const rawOffset = Number(url.searchParams.get('offset') ?? 0)

  try {
    const client = await getLedgerClient(session.user.email)
    const result = await client.search(q, rawLimit, rawOffset)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof LedgerInputError) {
      return NextResponse.json({ errors: e.errors }, { status: 400 })
    }
    if (e instanceof LedgerBindingError) {
      return new NextResponse(e.message, { status: 500 })
    }
    throw e
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
  const body = (await req.json().catch((): null => null)) as { raw_text?: unknown } | null
  if (!body || typeof body.raw_text !== 'string') {
    return NextResponse.json({ errors: ['invalid body'] }, { status: 400 })
  }

  try {
    const client = await getLedgerClient(session.user.email)
    const result = await client.create(body.raw_text)
    if ('transaction' in result) return NextResponse.json(result.transaction, { status: 201 })
    return NextResponse.json({ errors: result.errors }, { status: 400 })
  } catch (e) {
    if (e instanceof LedgerInputError) {
      return NextResponse.json({ errors: e.errors }, { status: 400 })
    }
    if (e instanceof LedgerBindingError) {
      return new NextResponse(e.message, { status: 500 })
    }
    throw e
  }
}
