import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth, TEST_USER_EMAIL } from '@/auth'
import { getLedgerClient } from '@/lib/ledger-api'
import type { ChatDO } from '@/durable/chat-do'

export const dynamic = 'force-dynamic'

// E2E harness for the REAL statement-ingest path (same gates as /api/test/bench).
// Unlike /api/test/bench (which runs the LEDGER editor agent, thinking off), this
// exercises production `runDraftStatement`: seed the ledger, stash the statement
// blob, then run the per-capture drafting on its own ChatDO instance — statement
// agent + thinking + the recording draft_transaction — and return the recorded
// drafts, validity, the tools the agent actually called, and its prose. Remove
// with the rest of the bench harness.
export async function POST(req: Request): Promise<Response> {
  if (!process.env.TEST_USER_TOKEN) return new NextResponse('not found', { status: 404 })
  const session = await auth()
  if (session?.user?.email !== TEST_USER_EMAIL) {
    return new NextResponse('forbidden', { status: 403 })
  }
  const body = (await req.json().catch((): null => null)) as {
    text?: unknown
    seed?: unknown
    filename?: unknown
    images?: unknown
  } | null
  if (!body || typeof body.text !== 'string' || !body.text.trim()) {
    return NextResponse.json({ error: 'text required' }, { status: 400 })
  }
  console.log('[ingest route] recv', {
    images_type: typeof body.images,
    is_array: Array.isArray(body.images),
    n: Array.isArray(body.images) ? body.images.length : undefined,
    first_chars:
      typeof body.images === 'string'
        ? (body.images as string).slice(0, 24)
        : Array.isArray(body.images) && typeof body.images[0] === 'string'
          ? body.images[0].slice(0, 24)
          : undefined,
    text_len: body.text.length,
  })

  const client = await getLedgerClient(TEST_USER_EMAIL)
  // Reset + seed the shared test ledger (same store the ingest run reads from).
  if (typeof body.seed === 'string') {
    await client.clear()
    if (body.seed.trim()) {
      await client.replace_buffer({ knownIds: [], buffer: body.seed } as never)
    }
  }

  const id = `STMT-${crypto.randomUUID()}`
  await client.put_statement({
    id,
    ownerEmail: TEST_USER_EMAIL,
    filename: typeof body.filename === 'string' ? body.filename : 'statement.pdf',
    text: body.text,
    images: Array.isArray(body.images)
      ? body.images.filter((x): x is string => typeof x === 'string')
      : [],
    capture: true,
  })

  // Run the drafting on the SAME per-capture DO the upload path uses
  // (email::<id>), so ledgerStub() resolves to the seeded test ledger.
  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CHAT_DO as DurableObjectNamespace<ChatDO>
  const name = `${TEST_USER_EMAIL}::${id}`
  const stub = ns.get(ns.idFromName(name))
  await stub.setName(name)
  const result = await stub.runDraftStatement(id)

  return NextResponse.json({
    drafts: (result.drafts ?? []).map((text) => ({ text })),
    draftsValid: result.draftsValid ?? false,
    clarifies: (result.questions ?? []).map((question) => ({ question })),
    trace: result.trace ?? [],
    text: result.text ?? '',
    error: result.ok
      ? null
      : (result.error ?? result.questions?.[0] ?? result.text ?? 'no entries proposed'),
  })
}
