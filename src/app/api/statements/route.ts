import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { getLedgerClient } from '@/lib/ledger-api'
import type { ChatDO } from '@/durable/chat-do'

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

  // mode 'inbox' (global drop): capture row + headless background drafting —
  // the Inbox is THE ingestion surface; drafts are ready when the user opens
  // the item (owner call). Default (chat paperclip): pure storage, the
  // interactive chat flow is the explicit exception.
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
  if (inbox) {
    const { env, ctx } = await getCloudflareContext({ async: true })
    const ns = (env as Cloudflare.Env).CHAT_DO as DurableObjectNamespace<ChatDO> | undefined
    if (ns) {
      const stub = ns.get(ns.idFromName(email))
      ctx.waitUntil(
        // setName first: an instance that has never served a websocket is
        // unnamed, and the scheduled pipeline would run against the wrong
        // ledger (caught by the e2e smoke on the fresh test user).
        stub
          .setName(email)
          .then(() => stub.draftStatementAsync(id))
          .then((): undefined => undefined)
          .catch((e): undefined => {
            console.error('[statements] background draft failed', { id, err: String(e) })
            return undefined
          }),
      )
    }
  }
  return NextResponse.json({ id })
}
