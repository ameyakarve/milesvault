import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { ConciergeDO } from '@/durable/concierge-do'

export const dynamic = 'force-dynamic'

// Airport typeahead for /explore — searches the KG airport nodes (by name, city,
// and IATA) via the KB. `?q=` is the user's partial query; returns up to 8
// { iata, name }. Searched server-side (the airport set is large); the combobox
// debounces and calls this per keystroke.
export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ airports: [] })

  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CONCIERGE_DO as
    | DurableObjectNamespace<ConciergeDO>
    | undefined
  if (!ns) return new NextResponse('CONCIERGE_DO binding missing', { status: 500 })

  const stub = ns.get(ns.idFromName(session.user.email))
  const airports = await stub.searchAirports(q)
  return NextResponse.json({ airports })
}
