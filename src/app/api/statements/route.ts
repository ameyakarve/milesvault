import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { StatementExtractorDO } from '@/durable/statement-extractor'

export const dynamic = 'force-dynamic'

// POST /api/statements — stash extracted PDF text on a dedicated
// StatementExtractorDO keyed by the minted statement id. The chat agent's
// LedgerDO never sees these bytes. Returns { id }; the client embeds that
// id in its chat message as <statement id="STMT-..." filename="...">.
export async function POST(req: NextRequest): Promise<Response> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return new NextResponse('unauthorized', { status: 401 })

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

  const { env } = await getCloudflareContext({ async: true })
  const ns = env.STATEMENT_EXTRACTOR_DO as
    | DurableObjectNamespace<StatementExtractorDO>
    | undefined
  if (!ns) {
    return new NextResponse('STATEMENT_EXTRACTOR_DO binding missing', { status: 500 })
  }

  const id = `STMT-${crypto.randomUUID()}`
  const stub = ns.get(ns.idFromName(id))
  const r = await stub.ingest({
    statementId: id,
    ownerEmail: email,
    filename: body.filename,
    text: body.text,
  })
  if ('error' in r) {
    return NextResponse.json({ errors: [r.error] }, { status: 409 })
  }
  return NextResponse.json({ id })
}
