import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { withLedger } from '@/lib/ledger-route-handler'
import type { ChatDO } from '@/durable/chat-do'

export const dynamic = 'force-dynamic'

// Rules playground (experience.md §9): dry-run a pasted email. Always
// returns which rule fires (matcher evaluation is pure); with
// `preview: true` it also runs the statement agent headlessly and returns
// the draft entries it WOULD propose. Nothing is captured or committed.
export const POST = withLedger(async ({ client, req, email }) => {
  let body: { from?: string; subject?: string; text?: string; preview?: boolean }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return new NextResponse('expected JSON {from, subject, text, preview?}', { status: 400 })
  }
  const from = body.from?.trim() ?? ''
  const subject = body.subject?.trim() ?? ''
  const text = body.text?.trim() ?? ''

  const match = await client.match_email_rule({ from, subject })
  if (!body.preview || match.action === 'ignore' || !text) {
    return NextResponse.json({ match, preview: null })
  }

  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CHAT_DO as DurableObjectNamespace<ChatDO> | undefined
  if (!ns) return new NextResponse('CHAT_DO binding missing', { status: 500 })
  const chat = ns.get(ns.idFromName(email))
  const preview = await chat.previewDrafts({
    text: `From: ${from}\nSubject: ${subject}\n\n${text}`,
    instruction: match.prompt,
  })
  return NextResponse.json({ match, preview })
})
