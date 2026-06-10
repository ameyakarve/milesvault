import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

// The email automation log (experience.md §9): the last 50 inbound emails
// with their outcome (captured / ignored / rejected) and the rule that fired.
export const GET = withLedger(async ({ client }) => {
  return NextResponse.json(await client.list_ingest_log())
})
