import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'
import type { PostingSearchFilter } from '@/lib/ledger-core/posting-search'

export const dynamic = 'force-dynamic'

// GET /api/ledger/entries/find — TXN-level search for the edit/delete flow.
// Compact rows (no raw_text) + true total. Query params: payee, from, to,
// account (prefix, repeatable), amountGte, amountLte, sign, flag.
export const GET = withLedger(async ({ client, req }) => {
  const q = req.nextUrl.searchParams
  const ymd = /^\d{4}-\d{2}-\d{2}$/
  const filter: PostingSearchFilter = {}
  const payee = q.get('payee')?.trim()
  if (payee) filter.payee_q = payee.slice(0, 200)
  const from = q.get('from')?.trim()
  const to = q.get('to')?.trim()
  if ((from && ymd.test(from)) || (to && ymd.test(to))) {
    filter.date = {
      ...(from && ymd.test(from) ? { from } : {}),
      ...(to && ymd.test(to) ? { to } : {}),
    }
  }
  const prefix = q.getAll('account').filter(Boolean).slice(0, 50)
  if (prefix.length) filter.accounts = { prefix }
  const sign = q.get('sign')
  if (sign === 'debit' || sign === 'credit') filter.sign = sign
  const flag = q.get('flag')
  if (flag === '*' || flag === '!') filter.flag = flag
  const gte = Number(q.get('amountGte'))
  const lte = Number(q.get('amountLte'))
  if (Number.isFinite(gte) || Number.isFinite(lte)) {
    filter.amount = {
      signed: {
        ...(Number.isFinite(gte) ? { gte } : {}),
        ...(Number.isFinite(lte) ? { lte } : {}),
      },
    }
  }
  return NextResponse.json(await client.find_entries(filter))
})
