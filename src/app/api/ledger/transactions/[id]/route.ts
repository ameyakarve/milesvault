import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { LedgerDO } from '@/durable/ledger-do'
import { toTransaction } from '@/durable/ledger-types'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

function parseId(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

export const GET = withLedger<{ id: string }>(async ({ client, params }) => {
  const id = parseId(params.id)
  if (id === null) return new NextResponse('invalid id', { status: 400 })
  const txn = await client.get(id)
  if (!txn) return new NextResponse('not found', { status: 404 })
  return NextResponse.json(txn)
})

export const PATCH = withLedger<{ id: string }>(async ({ req, params, email }) => {
  const id = parseId(params.id)
  if (id === null) return new NextResponse('invalid id', { status: 400 })
  const body = (await req.json().catch((): null => null)) as { raw_text?: unknown } | null
  if (!body || typeof body.raw_text !== 'string') {
    return new NextResponse('invalid body', { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const ns = env.LEDGER_DO as DurableObjectNamespace<LedgerDO> | undefined
  if (!ns) return new NextResponse('LEDGER_DO binding missing', { status: 500 })
  const stub = ns.get(ns.idFromName(email))
  const row = await stub.update(id, body.raw_text)
  if (!row) return new NextResponse('not found', { status: 404 })
  return NextResponse.json(toTransaction(row))
})

export const DELETE = withLedger<{ id: string }>(async ({ client, params }) => {
  const id = parseId(params.id)
  if (id === null) return new NextResponse('invalid id', { status: 400 })
  const ok = await client.remove(id)
  if (!ok) return new NextResponse('not found', { status: 404 })
  return new NextResponse(null, { status: 204 })
})
