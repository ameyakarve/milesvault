import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { kbHttpOverFetch } from '@/durable/agents/tools/concierge/kb-tools'
import { resolveCardAccount } from '@/durable/agents/tools/editor/card-guide'

export const dynamic = 'force-dynamic'

// Canonical liability account for ONE card (by slug) — the add-accounts dialog
// resolves this when a card is picked, so it opens the SAME account a statement
// would, never a client-side guess.
export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
  const slug = req.nextUrl.searchParams.get('slug')?.trim()
  if (!slug) return NextResponse.json({ account: null })

  const { env } = await getCloudflareContext({ async: true })
  const kb = kbHttpOverFetch('https://kb', (env as Cloudflare.Env).KB)
  const account = await resolveCardAccount(kb, slug)
  return NextResponse.json({ account })
}
