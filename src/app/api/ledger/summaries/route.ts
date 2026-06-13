import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

// Per-account balance summaries — Vault home + the accounts-explorer balance
// view. With an explicit `asOf` it reports balances as of that date (the
// explorer's historical date-picker). WITHOUT one it reports the CURRENT
// state: everything to date, unbounded — the same plug-inclusive running total
// `balance_totals` (and the vault headline) use. A bounded "today" default
// clipped future-dated assertions and their pads — e.g. a balance the user
// just set dated tomorrow, with its plug dated today — and on a UTC server
// running behind the user's local date it dropped today's entries too, so the
// cards disagreed with the headline. Response: { rows: AccountSummaryRow[] }
export const GET = withLedger(async ({ client, req }) => {
  const asOf = req.nextUrl.searchParams.get('asOf')?.trim()
  const date = asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : '9999-12-31'
  const rows = await client.list_account_summaries(date)
  return NextResponse.json({ rows })
})
