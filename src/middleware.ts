import NextAuth from 'next-auth'
import authConfig from '@/auth.config'

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  if (!req.auth) {
    const url = new URL('/login', req.nextUrl.origin)
    url.searchParams.set('callbackUrl', req.nextUrl.pathname)
    return Response.redirect(url)
  }
})

export const config = {
  matcher: [
    '/((?!api/auth|api/internal|api/admin|api/version|login|kumo/login|kumo/standalone\\.css|_next/static|_next/image|favicon.ico).*)',
  ],
}
