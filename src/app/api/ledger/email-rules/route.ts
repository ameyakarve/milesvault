import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

// Email ingestion rules (experience.md §9): matcher (from/subject substring)
// + action (capture with a prompt, or ignore). First enabled match wins;
// no match falls back to a plain capture.
export const GET = withLedger(async ({ client }) => {
  return NextResponse.json(await client.list_email_rules())
})

export const POST = withLedger(async ({ client, req }) => {
  let body: {
    id?: number | null
    from_match?: string | null
    subject_match?: string | null
    action?: string
    prompt?: string | null
    enabled?: boolean
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return new NextResponse('expected a JSON rule', { status: 400 })
  }
  const action = body.action === 'ignore' ? 'ignore' : 'capture'
  if (!body.from_match?.trim() && !body.subject_match?.trim()) {
    return new NextResponse('a rule needs a from or subject matcher', { status: 400 })
  }
  return NextResponse.json(
    await client.save_email_rule({
      id: body.id ?? null,
      from_match: body.from_match ?? null,
      subject_match: body.subject_match ?? null,
      action,
      prompt: body.prompt ?? null,
      enabled: body.enabled ?? true,
    }),
  )
})

export const DELETE = withLedger(async ({ client, req }) => {
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return new NextResponse('id required', { status: 400 })
  }
  return NextResponse.json(await client.delete_email_rule(id))
})
