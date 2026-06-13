import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

export const GET = withLedger(async ({ client }) => {
  const [snap, balanceTargets] = await Promise.all([
    client.ledger_snapshot(),
    client.list_balance_targets(),
  ])
  const accounts = snap.accounts
    .filter((a) => a.close_date == null)
    .map((a) => a.account)
  return NextResponse.json({ accounts, balanceTargets })
})
