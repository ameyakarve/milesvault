import Discord from 'next-auth/providers/discord'
import type { NextAuthConfig } from 'next-auth'

export default {
  trustHost: true,
  providers: [
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
      // Discord is BOTH identity and the membership check. `email` gives us the
      // address we key each user's data by; `guilds.members.read` lets the login
      // gate read the signer's member object in OUR server and confirm they hold
      // the YouTube-membership role (assigned by Discord's official YouTube
      // integration). None of these are Google-sensitive scopes, so there is no
      // Google verification, consent-warning, or demo-video requirement.
      authorization: {
        params: { scope: 'identify email guilds.members.read' },
      },
    }),
  ],
  pages: { signIn: '/login' },
  cookies: {
    sessionToken: {
      name: 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
      },
    },
  },
} satisfies NextAuthConfig
