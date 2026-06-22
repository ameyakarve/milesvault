import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

// Returns the stored body text for a single capture, for the Inbox "View email"
// toggle. The capture id IS the statement id, and the body is already persisted
// in statements.text (for forwarded email this is a synthetic
// "From: …\nSubject: …\n\n<body>" string assembled by the email worker). We
// fetch it lazily — it's too large to include in the captures list poll.
export const GET = withLedger<{ id: string }>(async ({ client, params }) => {
  const id = params?.id
  if (!id) return new NextResponse('missing id', { status: 400 })
  const res = await client.query_sql('SELECT filename, text FROM statements WHERE id = ? LIMIT 1', [
    id,
  ])
  const row = res.rows[0]
  if (!row) return new NextResponse('not found', { status: 404 })
  return NextResponse.json({
    filename: typeof row.filename === 'string' ? row.filename : null,
    text: typeof row.text === 'string' ? row.text : '',
  })
})
