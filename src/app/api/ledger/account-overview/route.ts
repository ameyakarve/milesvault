import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

const toInt = (d: Date) =>
  d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()

// The per-account overview tab's data (docs/design/overview-tab.md).
// ?account=…&ccy=…&range=1m|3m|ytd|12m|all — windows always end today.
export const GET = withLedger(async ({ client, req }) => {
  const q = req.nextUrl.searchParams
  const account = q.get('account') ?? ''
  const ccy = q.get('ccy')
  const range = q.get('range') ?? '3m'
  const now = new Date()
  const to = toInt(now)
  let from = 0
  if (range !== 'all') {
    const d = new Date(now)
    if (range === '1m') d.setUTCMonth(d.getUTCMonth() - 1)
    else if (range === 'ytd') {
      d.setUTCMonth(0)
      d.setUTCDate(1)
    } else if (range === '12m') d.setUTCFullYear(d.getUTCFullYear() - 1)
    else d.setUTCMonth(d.getUTCMonth() - 3)
    from = toInt(d)
  }
  return NextResponse.json(
    await client.account_overview({ account, currency: ccy, fromInt: from, toInt: to }),
  )
})
