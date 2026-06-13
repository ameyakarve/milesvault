import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

// Per-account FLOW totals under one root (Expenses, Income, …) over [from, to]
// (YYYY-MM-DD) — powers the accounts-explorer treemap. The client builds the
// hierarchy by splitting each account on ':'.
export const GET = withLedger(async ({ client, req }) => {
  const params = req.nextUrl.searchParams
  const root = params.get('root')?.trim()
  const from = params.get('from')?.trim()
  const to = params.get('to')?.trim()
  if (!root || !from || !to) return NextResponse.json({ rows: [] })
  const rows = await client.account_flows(root, from, to)
  return NextResponse.json({ rows })
})
