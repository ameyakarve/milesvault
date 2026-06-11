import NextAuth from 'next-auth'
import { cookies } from 'next/headers'
import type { Session } from 'next-auth'
import authConfig from './auth.config'

export const TEST_USER_EMAIL = 'test@milesvault.test'

const nextAuth = NextAuth({
  ...authConfig,
  session: { strategy: 'jwt' },
  callbacks: {
    authorized({ auth: session }) {
      return !!session
    },
    signIn({ profile }) {
      const allow = (process.env.ALLOWED_EMAILS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (allow.length === 0) return true
      return !!profile?.email && allow.includes(profile.email)
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
