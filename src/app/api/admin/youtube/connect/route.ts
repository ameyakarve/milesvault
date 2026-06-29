import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { ownerEmail } from '@/lib/membership'

export const dynamic = 'force-dynamic'

// One-time owner bootstrap, step 1: send the channel owner to Google's consent
// screen for the creator-only membership scope, with offline access so we get a
// REFRESH token (access_type=offline + prompt=consent forces it). The resulting
// token is the one whose channel's members the DO lists — so only the channel
// owner (first ALLOWED_EMAILS entry) may run this. Visit /api/admin/youtube/connect.
export async function GET(request: Request): Promise<Response> {
  const session = await auth()
  // Owner gate: the owner's storage key is their email (= ALLOWED_EMAILS[0]).
  const key = session?.user?.key
  const { env } = await getCloudflareContext({ async: true })
  const cf = env as Cloudflare.Env
  const owner = ownerEmail(cf)
  if (!key || !owner || key !== owner) return new NextResponse('forbidden', { status: 403 })

  const origin = new URL(request.url).origin
  const params = new URLSearchParams({
    client_id: cf.AUTH_GOOGLE_ID,
    redirect_uri: `${origin}/api/admin/youtube/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/youtube.channel-memberships.creator',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  })
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
}
