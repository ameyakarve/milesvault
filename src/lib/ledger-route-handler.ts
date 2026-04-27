import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getLedgerClient, LedgerBindingError, LedgerInputError } from '@/lib/ledger-api'
import type { LedgerClient } from '@/lib/ledger-api'

type HandlerCtx<P> = {
  client: LedgerClient
  req: NextRequest
  params: P
  email: string
}

type HandlerFn<P> = (ctx: HandlerCtx<P>) => Promise<Response> | Response

export function withLedger<P = Record<string, never>>(handler: HandlerFn<P>) {
  return async (
    req: NextRequest,
    routeCtx?: { params: Promise<P> },
  ): Promise<Response> => {
    const session = await auth()
    if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
    const params = routeCtx ? await routeCtx.params : ({} as P)
    try {
      const client = await getLedgerClient(session.user.email)
      return await handler({ client, req, params, email: session.user.email })
    } catch (e) {
      if (e instanceof LedgerInputError) {
        return NextResponse.json({ errors: e.errors }, { status: 400 })
      }
      if (e instanceof LedgerBindingError) {
        return new NextResponse(e.message, { status: 500 })
      }
      throw e
    }
  }
}
