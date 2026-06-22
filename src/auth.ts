import NextAuth from 'next-auth'
import { cookies } from 'next/headers'
import { getCloudflareContext } from '@opennextjs/cloudflare'
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
    // Login gate. Sign-in is Discord (auth.config). Access = a member of our
    // Discord server holding the configured member role — which Discord's
    // official YouTube-membership integration assigns to linked channel members.
    // So YouTube membership flows through to access via Discord, with no Google
    // sensitive scope or verification anywhere. There is NO allowlist bypass:
    // everyone, owner included, goes through the role check. FAIL-CLOSED:
    // anything we can't confirm is denied.
    async signIn({ account, profile }) {
      const email = profile?.email
      if (!email) return false
      const { env } = await getCloudflareContext({ async: true })
      const cf = env as Cloudflare.Env

      const token = account?.access_token
      const guild = (cf as { DISCORD_GUILD_ID?: string }).DISCORD_GUILD_ID
      const roleId = (cf as { DISCORD_MEMBER_ROLE_ID?: string }).DISCORD_MEMBER_ROLE_ID
      if (!token || !guild || !roleId) {
        console.warn('[gate] discord check skipped — missing token/config', {
          email,
          hasToken: !!token,
          hasGuild: !!guild,
          hasRole: !!roleId,
        })
        return false
      }
      // Diagnostics: the signing account's Discord id + the scopes Discord
      // actually granted + the guild we're checking. Lets us tell apart
      // "wrong account", "missing scope", and "wrong guild" from the logs.
      const discordId = (profile as { id?: string })?.id
      const scope = (account as { scope?: string })?.scope
      try {
        // The signer's member object in OUR server (404 = not in the server).
        const res = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guild}/member`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 404) {
          const body = await res.text().catch(() => '')
          console.log('[gate] discord: not in server', {
            email,
            discordId,
            guild,
            scope,
            body: body.slice(0, 200),
          })
          return false
        }
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          console.warn('[gate] discord member fetch failed', {
            email,
            discordId,
            guild,
            scope,
            status: res.status,
            body: body.slice(0, 200),
          })
          return false
        }
        const member = (await res.json()) as { roles?: string[] }
        const isMember = Array.isArray(member.roles) && member.roles.includes(roleId)
        console.log('[gate] discord', { email, discordId, guild, isMember, roles: member.roles })
        return isMember
      } catch (e) {
        console.warn('[gate] discord error', { email, err: String(e) })
        return false
      }
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
