import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { kbHttpOverFetch, listTransferSources } from '@/durable/agents/tools/concierge'

export const dynamic = 'force-dynamic'

// The KG-derived "Transfer from" list (credit cards + transferable currencies)
// for the explorer's source picker. Computed on demand straight off the KB
// service binding — no server-side cache. The client fetches it once per mount.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })

  const { env } = await getCloudflareContext({ async: true })
  const kbBinding = (env as Cloudflare.Env).KB
  if (!kbBinding) return new NextResponse('KB binding missing', { status: 500 })

  const kb = kbHttpOverFetch('https://kb', kbBinding)
  const sources = await listTransferSources(kb)
  return NextResponse.json({ sources })
}
