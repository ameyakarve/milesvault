import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

// Per-account Expenses totals over [from, to] (YYYY-MM-DD) — powers the expense
// explorer treemap. The client builds the category hierarchy by splitting each
// account on ':'.
export const GET = withLedger(async ({ client, req }) => {
  const params = req.nextUrl.searchParams
  const from = params.get('from')?.trim()
  const to = params.get('to')?.trim()
  if (!from || !to) return NextResponse.json({ rows: [] })
  const rows = await client.expense_tree(from, to)
  return NextResponse.json({ rows })
})
