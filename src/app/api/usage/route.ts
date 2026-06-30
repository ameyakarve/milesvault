import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { UsageDO } from '@/durable/usage-do'

export const dynamic = 'force-dynamic'

// The signed-in user's AI usage this month (monitoring only). Reads their
// per-user UsageDO (keyed by storage_key). Tokens + computed USD; no enforcement.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.key) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as unknown as { USAGE_DO?: DurableObjectNamespace<UsageDO> }).USAGE_DO
  if (!ns) return NextResponse.json({ error: 'usage unavailable' }, { status: 500 })
  const spend = await ns.get(ns.idFromName(session.user.key)).spendUsd()
  return NextResponse.json(spend)
}
