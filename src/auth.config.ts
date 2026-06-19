import Google from 'next-auth/providers/google'
import type { NextAuthConfig } from 'next-auth'

export default {
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // "Login with YouTube" = Google OAuth + the YouTube read scope. We ALWAYS
      // request `youtube.readonly` so the signer's channel is readable at login
      // (channels.list?mine=true) — its channelId is the key matched against the
      // member roster. The scope is constant; the MEMBERSHIP_GATE flag is a SEPARATE
      // decision that only controls ENFORCEMENT (allow everyone vs members-only), not
      // what we ask for. Note: `youtube.readonly` is a SENSITIVE scope — Google
      // verification is needed beyond ~100 test users, and login shows a YouTube-
      // access consent screen.
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/youtube.readonly',
        },
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
