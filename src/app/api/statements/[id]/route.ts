import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

// GET /api/statements/:id — poll for extraction status.
// Returns { status, filename, error? } — `batch` is intentionally omitted
// from the wire response since the client only needs status. The card itself
// is materialized server-side via submit_statement_card.
export const GET = withLedger<{ id: string }>(async ({ client, params }) => {
  const rec = await client.get_statement(params.id)
  if (!rec) return new NextResponse('not found', { status: 404 })
  return NextResponse.json({
    id: rec.id,
    filename: rec.filename,
    status: rec.status,
    error: rec.error,
  })
})

// DELETE /api/statements/:id — abandon an upload (user removed the chip
// before submitting).
export const DELETE = withLedger<{ id: string }>(async ({ client, params }) => {
  await client.delete_statement(params.id)
  return NextResponse.json({ ok: true })
})
