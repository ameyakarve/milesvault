import NextAuth from 'next-auth'
import { cookies } from 'next/headers'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { Session } from 'next-auth'
import authConfig from './auth.config'
import { membershipStub } from './lib/membership'

export const TEST_USER_EMAIL = 'test@milesvault.test'

const nextAuth = NextAuth({
  ...authConfig,
  session: { strategy: 'jwt' },
  callbacks: {
    authorized({ auth: session }) {
      return !!session
    },
    // Login gate. We ALWAYS resolve + log the signer's YouTube channel and
    // membership (the path is live regardless of enforcement, so we can see who
    // WOULD be gated). The MEMBERSHIP_GATE flag is the single enforcement knob:
    //   OFF (default) → allow EVERYONE (details logged, decision ignored).
    //   ON            → members only, with ALLOWED_EMAILS as the always-in safety
    //                   hatch (owner + trusted, so you can never be locked out).
    async signIn({ account, profile }) {
      const email = profile?.email
      if (!email) return false
      const gateOn = process.env.MEMBERSHIP_GATE === '1'

      // Resolve the channel (channels.list?mine=true) and ask the DO whether it's a
      // member — best-effort, logged. checkNow no-ops cheaply until the creator
      // token is bootstrapped, so this is free pre-launch.
      let channelId: string | null = null
      let isMember = false
      const token = account?.access_token
      if (token) {
        try {
          const res = await fetch(
            'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true',
            { headers: { Authorization: `Bearer ${token}` } },
          )
          if (res.ok) {
            const data = (await res.json()) as {
              items?: Array<{ id?: string; snippet?: { title?: string } }>
            }
            channelId = data.items?.[0]?.id ?? null
            const title = data.items?.[0]?.snippet?.title ?? null
            if (channelId) {
              const { env } = await getCloudflareContext({ async: true })
              isMember = await membershipStub(env as Cloudflare.Env).checkNow(channelId)
            }
            console.log('[membership] signin', { email, channelId, title, isMember, gateOn })
          } else {
            console.warn('[membership] channels.list failed', { status: res.status, email })
          }
        } catch (e) {
          console.warn('[membership] resolve error', { email, err: String(e) })
        }
      }

      if (!gateOn) return true // OFF: allow everyone (details logged above)
      const allow = (process.env.ALLOWED_EMAILS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (allow.includes(email)) return true // ON: safety hatch
      return isMember // ON: members only
    },
  },
})

export const { handlers, signIn, signOut } = nextAuth

// The e2e test identity (owner decision): when TEST_USER_TOKEN is set in the
// environment (staging only — production never gets the secret) and the
// request carries it in the mv-test-token cookie, auth() returns a synthetic
// session for an isolated test user. Per-email DOs keep its ledger, inbox and
// chats fully separate from real users. Zero-arg calls only — the middleware
// uses its own NextAuth instance and is bypassed for this cookie via matcher
// handling in middleware.ts.
export async function auth(): Promise<Session | null> {
  const expected = process.env.TEST_USER_TOKEN
  if (expected) {
    try {
      const token = (await cookies()).get('mv-test-token')?.value
      if (token === expected) {
        return {
          user: { email: TEST_USER_EMAIL },
          expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        } as Session
      }
    } catch {
      /* not in a request context */
    }
  }
  return nextAuth.auth()
}
