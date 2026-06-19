import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { membershipStub, ownerEmail } from '@/lib/membership'

export const dynamic = 'force-dynamic'

// Owner debug: roster size, today's quota spend, cursor/refresh state, last sync
// times. Visit /api/admin/youtube/status after bootstrapping.
export async function GET(): Promise<Response> {
  const session = await auth()
  const email = session?.user?.email
  const { env } = await getCloudflareContext({ async: true })
  const cf = env as Cloudflare.Env
  const owner = ownerEmail(cf)
  if (!email || !owner || email !== owner) return new NextResponse('forbidden', { status: 403 })
  return NextResponse.json({
    gateEnabled: (cf as { MEMBERSHIP_GATE?: string }).MEMBERSHIP_GATE === '1',
    ...(await membershipStub(cf).status()),
  })
}
