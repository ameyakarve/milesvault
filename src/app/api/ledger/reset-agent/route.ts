import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getChatClient } from '@/lib/ledger-api'

export const dynamic = 'force-dynamic'

// Resets the chat agent back to its entry persona (ledger) — called when the
// user clears the conversation. The agent runtime lives in ChatDO, not the
// storage LedgerDO, so this talks to the chat client.
export async function POST(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.key) return new NextResponse('unauthorized', { status: 401 })
  const chat = await getChatClient(session.user.key)
  await chat.reset_active_agent()
  return NextResponse.json({ ok: true })
}
