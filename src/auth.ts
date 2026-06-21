import NextAuth from 'next-auth'
import { cookies } from 'next/headers'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { Session } from 'next-auth'
import authConfig from './auth.config'
import { membershipStub } from './lib/membership'
import { appAccessAllowed } from './lib/flags'

export const TEST_USER_EMAIL = 'test@milesvault.test'

const nextAuth = NextAuth({
  ...authConfig,
  session: { strategy: 'jwt' },
  callbacks: {
    authorized({ auth: session }) {
      return !!session
    },
    // Login gate, driven by the Flagship `app_access` flag (evaluated with the
    // user's email AND the environment, so one flag gates prod + staging with
    // per-env / per-email rules from the dashboard — no redeploy). Default is
    // ALLOW (open); restrict from the dashboard. The signer's YouTube channel +
    // membership are still resolved and logged (so we can see who WOULD qualify
    // for a future membership-based gate), but no longer decide access.
    async signIn({ account, profile }) {
      const email = profile?.email
      if (!email) return false
      const { env } = await getCloudflareContext({ async: true })

      // Best-effort membership resolution — LOGGING ONLY now. checkNow no-ops
      // cheaply until the creator token is bootstrapped.
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
            if (channelId) {
              isMember = await membershipStub(env as Cloudflare.Env).checkNow(channelId)
            }
          } else {
            console.warn('[membership] channels.list failed', { status: res.status, email })
          }
        } catch (e) {
          console.warn('[membership] resolve error', { email, err: String(e) })
        }
      }

      // Access = a channel MEMBER, OR the Flagship `app_access` flag (per-env /
      // per-email). Members are always in (that's the membership gate); the flag
      // controls everyone else and is flipped from the dashboard. Default flag is
      // allow, so today it's open; set it OFF to make it members-only + allow-rules.
      const environment = (env as Cloudflare.Env).APP_ENV ?? 'unknown'
      const flagged = await appAccessAllowed(env as Cloudflare.Env, { email, environment })
      const allowed = isMember || flagged
      console.log('[gate] signin', { email, environment, isMember, flagged, allowed })
      return allowed
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
