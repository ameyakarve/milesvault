import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { conciergeEnabled } from '@/lib/flags'

export const dynamic = 'force-dynamic'

// Mint a short-lived single-use code pairing a messaging-bot chat to this
// account (docs/design/assistant-merge.md). The user sends `/start <code>`
// to the bot; the bot worker consumes the code from D1 and stores the
// chat↔email link. 15-minute TTL, enforced by the bot worker.
export async function POST(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })

  const { env } = await getCloudflareContext({ async: true })

  // Concierge kill switch: no new Telegram pairings while the assistant is off.
  if (!(await conciergeEnabled(env as Cloudflare.Env, { email: session.user.email }))) {
    return new NextResponse('forbidden', { status: 403 })
  }

  const db = (env as Cloudflare.Env).D1 as D1Database | undefined
  if (!db) return new NextResponse('D1 binding missing', { status: 500 })

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS bot_pair_codes (
         code       TEXT PRIMARY KEY,
         email      TEXT NOT NULL,
         created_at INTEGER NOT NULL
       )`,
    )
    .run()
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS bot_links (
         chat_id    TEXT PRIMARY KEY,
         email      TEXT NOT NULL,
         created_at INTEGER NOT NULL
       )`,
    )
    .run()

  // 8 chars, unambiguous lowercase alphanumerics.
  const code = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31])
    .join('')
  await db
    .prepare('INSERT INTO bot_pair_codes (code, email, created_at) VALUES (?, ?, ?)')
    .bind(code, session.user.email, Date.now())
    .run()
  return NextResponse.json({ code, command: `/start ${code}` })
}
