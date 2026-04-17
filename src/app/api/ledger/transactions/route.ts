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

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
  const body = (await req.json().catch((): null => null)) as { raw_text?: unknown } | null
  if (!body || typeof body.raw_text !== 'string') {
    return new NextResponse('invalid body', { status: 400 })
  }
  const stub = await getStub(session.user.email)
  if (!stub) return new NextResponse('LEDGER_DO binding missing', { status: 500 })
  const row = await stub.create(body.raw_text)
  if (!row) return new NextResponse('not implemented', { status: 501 })
  return NextResponse.json(row, { status: 201 })
}
