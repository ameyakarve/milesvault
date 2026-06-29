import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { membershipStub, ownerEmail } from '@/lib/membership'

export const dynamic = 'force-dynamic'

// Owner bootstrap, step 2: Google redirects here with a code. Exchange it for the
// creator REFRESH token and hand it to the MembershipDO, which seeds the roster
// (all_current), opens the updates stream, and starts the 60s poll. After this the
// membership machinery is live but still a no-op until MEMBERSHIP_GATE==='1'.
export async function GET(request: Request): Promise<Response> {
  const session = await auth()
  // Owner gate: the owner's storage key is their email (= ALLOWED_EMAILS[0]).
  const key = session?.user?.key
  const { env } = await getCloudflareContext({ async: true })
  const cf = env as Cloudflare.Env
  const owner = ownerEmail(cf)
  if (!key || !owner || key !== owner) return new NextResponse('forbidden', { status: 403 })

  const url = new URL(request.url)
  const oauthErr = url.searchParams.get('error')
  if (oauthErr) return new NextResponse(`oauth error: ${oauthErr}`, { status: 400 })
  const code = url.searchParams.get('code')
  if (!code) return new NextResponse('missing authorization code', { status: 400 })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cf.AUTH_GOOGLE_ID,
      client_secret: cf.AUTH_GOOGLE_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${url.origin}/api/admin/youtube/callback`,
    }),
  })
  if (!res.ok) {
    return new NextResponse(
      `token exchange failed: ${res.status} ${await res.text().catch(() => '')}`,
      { status: 502 },
    )
  }
  const data = (await res.json()) as { refresh_token?: string }
  if (!data.refresh_token) {
    // Google only returns a refresh token on the FIRST consent with offline
    // access; a re-grant without it means a prior authorization is still active.
    return new NextResponse(
      'no refresh_token returned — revoke the prior grant at ' +
        'https://myaccount.google.com/permissions and retry.',
      { status: 400 },
    )
  }
  const result = await membershipStub(cf).connectCreator(data.refresh_token)
  if (!result.ok) {
    return new NextResponse(
      'stored the token but could not reach the YouTube members API — confirm the ' +
        'channel has memberships (YouTube Partner Program) enabled.',
      { status: 502 },
    )
  }
  return NextResponse.json({
    ok: true,
    channel: result.channelTitle,
    note: 'creator token stored; membership poll is live. Set MEMBERSHIP_GATE=1 to enforce.',
  })
}
