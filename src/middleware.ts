import NextAuth from 'next-auth'
import authConfig from '@/auth.config'

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  // The homepage is a PUBLIC landing (describes the app, no login wall — a Google
  // OAuth-verification requirement). The page itself sends signed-in users on to
  // /vault.
  if (req.nextUrl.pathname === '/') return
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
    '/((?!api/auth|api/internal|api/admin|api/version|login|privacy|terms|logo|icon|apple-icon|manifest|web-app-manifest|_next/static|_next/image|favicon.ico).*)',
  ],
}
