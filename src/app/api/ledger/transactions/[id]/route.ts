import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { LedgerDO } from '@/durable/ledger-do'

export const dynamic = 'force-dynamic'

async function getStub(email: string) {
  const { env } = await getCloudflareContext({ async: true })
  const ns = env.LEDGER_DO as DurableObjectNamespace<LedgerDO> | undefined
  if (!ns) return null
  return ns.get(ns.idFromName(email))
}

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
  const stub = await getStub(session.user.email)
  if (!stub) return new NextResponse('LEDGER_DO binding missing', { status: 500 })
  const row = await stub.get(id)
  if (!row) return new NextResponse('not found', { status: 404 })
  return NextResponse.json(row)
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
  const stub = await getStub(session.user.email)
  if (!stub) return new NextResponse('LEDGER_DO binding missing', { status: 500 })
  const row = await stub.update(id, body.raw_text)
  if (!row) return new NextResponse('not found', { status: 404 })
  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
  const { id: rawId } = await params
  const id = parseId(rawId)
  if (id === null) return new NextResponse('invalid id', { status: 400 })
  const stub = await getStub(session.user.email)
  if (!stub) return new NextResponse('LEDGER_DO binding missing', { status: 500 })
  const ok = await stub.remove(id)
  if (!ok) return new NextResponse('not found', { status: 404 })
  return new NextResponse(null, { status: 204 })
}
