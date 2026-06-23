import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { AirportsDO } from '@/durable/airports/airports-do'

export const dynamic = 'force-dynamic'

// Airport typeahead — searches the dedicated AirportsDO (FTS5 over iata / name /
// city / country), a single shared reference store. `?q=` is the partial query;
// returns up to 8 { iata, name, city }. The combobox debounces and calls this
// per keystroke.
export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ airports: [] })

  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).AIRPORTS_DO as
    | DurableObjectNamespace<AirportsDO>
    | undefined
  if (!ns) return new NextResponse('AIRPORTS_DO binding missing', { status: 500 })

  // Single shared instance — airports are global reference data.
  const stub = ns.get(ns.idFromName('global'))
  const airports = await stub.search(q)
  return NextResponse.json({ airports })
}
