import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

const ALLOWLIST = new Set(['ameya.karve@gmail.com'])

type Body = {
  sql?: unknown
  params?: unknown
}

export const POST = withLedger(async ({ client, email, req }) => {
  if (!ALLOWLIST.has(email)) {
    return new NextResponse('forbidden', { status: 403 })
  }
  const body = (await req.json().catch((): Body => ({}))) as Body
  if (typeof body.sql !== 'string' || body.sql.trim().length === 0) {
    return NextResponse.json({ error: 'sql required' }, { status: 400 })
  }
  const params = Array.isArray(body.params)
    ? (body.params.filter(
        (p) => p === null || typeof p === 'string' || typeof p === 'number',
      ) as Array<string | number | null>)
    : []
  try {
    const result = await client.query_sql(body.sql, params)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    )
  }
})
