import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import { kbHttpOverFetch } from '@/durable/agents/tools/concierge/kb-tools'
import { listRewardAccounts } from '@/durable/agents/tools/editor/card-guide'

export const dynamic = 'force-dynamic'

// Loyalty programmes (non-fiat currencies) with their canonical rewards
// account + ticker — powers the Programmes tab of the add dialog. Same closed
// set + classification the editor's `list_reward_accounts` tool serves, so the
// dialog and the agent never diverge: bank/issuer pools → Assets:Rewards:<Bank>,
// airline FFP (…-miles) → Assets:Rewards:Miles, else → Assets:Rewards:Points.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { env } = await getCloudflareContext({ async: true })
  const kb = kbHttpOverFetch('https://kb', (env as Cloudflare.Env).KB)
  const items = await listRewardAccounts(kb)
  return NextResponse.json({ items })
}
