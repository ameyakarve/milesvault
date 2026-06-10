import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getLedgerClient } from '@/lib/ledger-api'

export const dynamic = 'force-dynamic'

// POST /api/statements — stash extracted PDF text in the user's LedgerDO
// (pure storage) keyed by a minted statement id. Returns { id }; the client
// embeds that id in its chat message as <statement id="STMT-..." filename="..." />.
// The chat agent later reads it back over RPC via read_statement.
export async function POST(req: NextRequest): Promise<Response> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return new NextResponse('unauthorized', { status: 401 })

  const body = (await req.json().catch((): null => null)) as
    | { filename?: unknown; text?: unknown; mode?: unknown }
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

  // mode 'inbox' (global drop): create a capture row — the statement waits
  // in the Inbox until the user reviews it. NO processing happens at drop
  // time (owner call). Default (chat paperclip): pure storage, interactive
  // flow unchanged.
  const inbox = body.mode === 'inbox'
  const client = await getLedgerClient(email)
  const id = `STMT-${crypto.randomUUID()}`
  await client.put_statement({
    id,
    ownerEmail: email,
    filename: body.filename,
    text: body.text,
    capture: inbox,
  })
  return NextResponse.json({ id })
}
