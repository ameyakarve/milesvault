import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

// POST /api/statements — stash extracted PDF text in DO side-storage.
// Body: { filename: string, text: string }. Returns { id }.
// The client embeds that id in its chat message via
// <statement id="STMT-..." filename="..."> so the bytes never enter the
// chat agent's history.
export const POST = withLedger(async ({ client, req }) => {
  const body = (await req.json().catch((): null => null)) as
    | { filename?: unknown; text?: unknown }
    | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ errors: ['invalid body'] }, { status: 400 })
  }
  if (typeof body.filename !== 'string' || body.filename.length === 0) {
    return NextResponse.json({ errors: ['filename required'] }, { status: 400 })
  }
  if (typeof body.text !== 'string' || body.text.length === 0) {
    return NextResponse.json({ errors: ['text required'] }, { status: 400 })
  }
  const result = await client.attach_statement({
    filename: body.filename,
    text: body.text,
  })
  return NextResponse.json(result)
})
