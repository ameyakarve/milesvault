import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { signChatToken } from '@/lib/chat/session-token'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })

  const secret = process.env.AUTH_SECRET
  if (!secret) return new NextResponse('server misconfigured', { status: 500 })

  const { token, email, exp } = await signChatToken(session.user.email, secret)
  return NextResponse.json({ token, email, exp })
}
