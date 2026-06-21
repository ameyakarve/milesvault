import NextAuth from 'next-auth'
import authConfig from '@/auth.config'

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  if (!req.auth) {
    // e2e test identity: the per-route auth() validates the token against
    // TEST_USER_TOKEN; the middleware only needs to not redirect it.
    if (req.cookies.get('mv-test-token')?.value) return
    const url = new URL('/login', req.nextUrl.origin)
    url.searchParams.set('callbackUrl', req.nextUrl.pathname)
    return Response.redirect(url)
  }
})

export const config = {
  matcher: [
    '/((?!api/auth|api/internal|api/admin|api/version|login|privacy|terms|logo|_next/static|_next/image|favicon.ico).*)',
  ],
}
