import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

const toInt = (d: Date) =>
  d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()

// Vault headline aggregates — card outstanding, bank totals, this month's
// spending by category. Period is month-to-date.
export const GET = withLedger(async ({ client }) => {
  const now = new Date()
  const from = now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + 1
  return NextResponse.json(await client.vault_stats({ fromInt: from, toInt: toInt(now) }))
})
