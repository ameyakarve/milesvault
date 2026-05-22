import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'
import { postingSearchSchema } from '@/lib/ledger-core/posting-search'

export const dynamic = 'force-dynamic'

export const POST = withLedger(async ({ client, req }) => {
  const body = (await req.json().catch((): unknown => null)) as unknown
  const parsed = postingSearchSchema.safeParse(body ?? {})
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_filter', issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const result = await client.search_postings(parsed.data)
  return NextResponse.json(result)
})
