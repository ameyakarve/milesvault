import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const GET = withLedger(async ({ client, req }) => {
  const url = new URL(req.url)
  const account = url.searchParams.get('account') || null
  const dateFrom = url.searchParams.get('dateFrom') || null
  const dateTo = url.searchParams.get('dateTo') || null
  const cursorDate = url.searchParams.get('cursorDate')
  const cursorId = url.searchParams.get('cursorId')
  const limitRaw = url.searchParams.get('limit')

  if (dateFrom && !DATE_RE.test(dateFrom)) {
    return NextResponse.json({ errors: ['dateFrom must be YYYY-MM-DD.'] }, { status: 400 })
  }
  if (dateTo && !DATE_RE.test(dateTo)) {
    return NextResponse.json({ errors: ['dateTo must be YYYY-MM-DD.'] }, { status: 400 })
  }
  const cursor =
    cursorDate && cursorId && DATE_RE.test(cursorDate) && Number.isFinite(Number(cursorId))
      ? { date: cursorDate, id: Number(cursorId) }
      : null
  const limit = limitRaw && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : null

  const result = await client.journal_get_filtered({
    account,
    dateFrom,
    dateTo,
    cursor,
    limit,
  })
  return NextResponse.json(result)
})
