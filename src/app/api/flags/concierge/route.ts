import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { conciergeEnabled } from '@/lib/flags'

export const dynamic = 'force-dynamic'

// Whether the concierge assistant is enabled for the signed-in user — drives
// hiding the nav item. The page redirect + DO/pairing gates are the real
// enforcement; this is cosmetic. Fail-closed: any error reads as disabled.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.key) return NextResponse.json({ enabled: false })
  const { env } = await getCloudflareContext({ async: true })
  // Flag targeting uses the storage key. The owner's key is their (legacy)
  // email, so the existing Flagship admin rule still matches with no change.
  const enabled = await conciergeEnabled(env as Cloudflare.Env, { email: session.user.key })
  return NextResponse.json({ enabled })
}
