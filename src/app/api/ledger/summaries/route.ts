import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

// Per-account balance summaries as of a date (default today) — Vault home +
// the accounts-explorer balance view. Response: { rows: AccountSummaryRow[] }
export const GET = withLedger(async ({ client, req }) => {
  const asOf = req.nextUrl.searchParams.get('asOf')?.trim()
  const date =
    asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : new Date().toISOString().slice(0, 10)
  const rows = await client.list_account_summaries(date)
  return NextResponse.json({ rows })
})
