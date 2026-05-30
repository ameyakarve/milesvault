import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getChatClient } from '@/lib/ledger-api'

export const dynamic = 'force-dynamic'

// Debug-only: dumps the raw UIMessage[] for the signed-in user's ChatDO. Used
// to inspect what the model actually emitted (e.g. multiple draft_transaction
// calls in one assistant message) without UI rendering in the way.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
  const chat = await getChatClient(session.user.email)
  const messages = await chat.dump_messages()
  return NextResponse.json({ count: messages.length, messages })
}
