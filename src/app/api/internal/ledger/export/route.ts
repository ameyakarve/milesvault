import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { LedgerDO } from '@/durable/ledger-do'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { env } = await getCloudflareContext({ async: true })

  const expected = (env as unknown as { PROD_EXPORT_TOKEN?: string }).PROD_EXPORT_TOKEN
  if (!expected) return new NextResponse('export disabled', { status: 404 })

  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${expected}`) return new NextResponse('unauthorized', { status: 401 })

  const email = req.nextUrl.searchParams.get('email')
  if (!email) return new NextResponse('missing email', { status: 400 })

  const ns = env.LEDGER_DO as DurableObjectNamespace<LedgerDO> | undefined
  if (!ns) return new NextResponse('LEDGER_DO binding missing', { status: 500 })

  const stub = ns.get(ns.idFromName(email))
  const rows = await stub.exportAll()

  return NextResponse.json({ email, rows })
}
