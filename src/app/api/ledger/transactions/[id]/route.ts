import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { LedgerBindingError, LedgerInputError, getLedgerClient } from '@/lib/ledger-api'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { LedgerDO } from '@/durable/ledger-do'
import { toTransaction } from '@/durable/ledger-types'

export const dynamic = 'force-dynamic'

function parseId(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
  const { id: rawId } = await params
  const id = parseId(rawId)
  if (id === null) return new NextResponse('invalid id', { status: 400 })

  try {
    const client = await getLedgerClient(session.user.email)
    const txn = await client.get(id)
    if (!txn) return new NextResponse('not found', { status: 404 })
    return NextResponse.json(txn)
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
  const { id: rawId } = await params
  const id = parseId(rawId)
  if (id === null) return new NextResponse('invalid id', { status: 400 })
  const body = (await req.json().catch((): null => null)) as { raw_text?: unknown } | null
  if (!body || typeof body.raw_text !== 'string') {
    return new NextResponse('invalid body', { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const ns = env.LEDGER_DO as DurableObjectNamespace<LedgerDO> | undefined
  if (!ns) return new NextResponse('LEDGER_DO binding missing', { status: 500 })
  const stub = ns.get(ns.idFromName(session.user.email))
  const row = await stub.update(id, body.raw_text)
  if (!row) return new NextResponse('not found', { status: 404 })
  return NextResponse.json(toTransaction(row))
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
  const { id: rawId } = await params
  const id = parseId(rawId)
  if (id === null) return new NextResponse('invalid id', { status: 400 })

  try {
    const client = await getLedgerClient(session.user.email)
    const ok = await client.remove(id)
    if (!ok) return new NextResponse('not found', { status: 404 })
    return new NextResponse(null, { status: 204 })
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
