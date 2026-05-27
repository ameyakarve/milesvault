import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

// POST /api/statements/:id/submit — consume the ready statement and inject
// the assistant tool-call into the chat history. The main LLM is NOT run.
// Body: { userText?: string } — optional narration the user typed.
export const POST = withLedger<{ id: string }>(async ({ client, req, params }) => {
  const body = (await req.json().catch((): null => null)) as
    | { userText?: unknown }
    | null
  const userText =
    body && typeof body.userText === 'string' ? body.userText : undefined
  const result = await client.submit_statement_card({ id: params.id, userText })
  if ('ok' in result && result.ok === false) {
    const status = result.error === 'not_found' ? 404 : 409
    return NextResponse.json(result, { status })
  }
  return NextResponse.json(result)
})
