import NextAuth from 'next-auth'
import authConfig from './auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
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
