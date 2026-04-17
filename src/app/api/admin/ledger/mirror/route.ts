import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { LedgerDO, TransactionRow } from '@/durable/ledger-do'

export const dynamic = 'force-dynamic'

type StagingEnv = {
  ENABLE_HYDRATE?: string
  ADMIN_TOKEN?: string
  PROD_EXPORT_TOKEN?: string
  PROD?: Fetcher
  LEDGER_DO?: DurableObjectNamespace<LedgerDO>
}

export async function POST(req: NextRequest) {
  const { env: rawEnv } = await getCloudflareContext({ async: true })
  const env = rawEnv as unknown as StagingEnv

  if (env.ENABLE_HYDRATE !== '1') return new NextResponse('not found', { status: 404 })

  const auth = req.headers.get('authorization') ?? ''
  if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    return new NextResponse('unauthorized', { status: 401 })
  }

  const email = req.nextUrl.searchParams.get('email')
  if (!email) return new NextResponse('missing email', { status: 400 })

  if (!env.PROD || !env.PROD_EXPORT_TOKEN) {
    return new NextResponse('PROD service binding or token missing', { status: 500 })
  }

  const exportRes = await env.PROD.fetch(
    `https://internal/api/internal/ledger/export?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${env.PROD_EXPORT_TOKEN}` } },
  )
  if (!exportRes.ok) {
    return new NextResponse(`prod export failed: ${exportRes.status}`, { status: 502 })
  }

  const { rows } = (await exportRes.json()) as { email: string; rows: TransactionRow[] }

  if (!env.LEDGER_DO) return new NextResponse('LEDGER_DO binding missing', { status: 500 })
  const stub = env.LEDGER_DO.get(env.LEDGER_DO.idFromName(email))
  const { copied } = await stub.importAll(rows)

  return NextResponse.json({ email, received: rows.length, copied })
}
