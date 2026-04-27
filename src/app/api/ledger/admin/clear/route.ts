import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

const ALLOWLIST = new Set(['ameya.karve@gmail.com'])

export const POST = withLedger(async ({ client, email }) => {
  if (!ALLOWLIST.has(email)) {
    return new NextResponse('forbidden', { status: 403 })
  }
  const result = await client.clear()
  return NextResponse.json(result)
})
