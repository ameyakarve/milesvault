import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

// Returns per-account balance summaries as of today, used by the Vault home.
// Response: { rows: AccountSummaryRow[] }
export const GET = withLedger(async ({ client }) => {
  // list_account_summaries expects a YYYY-MM-DD string; derive today's date.
  const today = new Date().toISOString().slice(0, 10)
  const rows = await client.list_account_summaries(today)
  return NextResponse.json({ rows })
})
