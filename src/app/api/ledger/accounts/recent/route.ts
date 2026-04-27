import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const GET = withLedger(async ({ client, req }) => {
  const url = new URL(req.url)
  const limit = Number(url.searchParams.get('limit') ?? 10)
  const accounts = await client.recent_accounts_list(limit)
  return NextResponse.json({ accounts })
})

export const POST = withLedger(async ({ client, req }) => {
  const body = (await req.json().catch((): null => null)) as { account?: unknown } | null
  if (!body || typeof body.account !== 'string') {
    return NextResponse.json({ errors: ['account required'] }, { status: 400 })
  }
  await client.recent_account_touch(body.account)
  return NextResponse.json({ ok: true })
})
