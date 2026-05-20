import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { AgentDO } from '@/durable/agent-do'
import type { LedgerDO } from '@/durable/ledger-do'

export const dynamic = 'force-dynamic'

type Stubs = {
  agent: DurableObjectStub<AgentDO>
  ledger: DurableObjectStub<LedgerDO>
}

async function getStubs(): Promise<Stubs | NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return new NextResponse('unauthorized', { status: 401 })
  }
  const { env } = await getCloudflareContext({ async: true })
  const cf = env as Cloudflare.Env
  const agentNs = cf.AGENT_DO as DurableObjectNamespace<AgentDO> | undefined
  const ledgerNs = cf.LEDGER_DO as DurableObjectNamespace<LedgerDO> | undefined
  if (!agentNs || !ledgerNs) {
    return new NextResponse('DO binding missing', { status: 500 })
  }
  const email = session.user.email
  return {
    agent: agentNs.get(agentNs.idFromName(email)),
    ledger: ledgerNs.get(ledgerNs.idFromName(email)),
  }
}

export async function GET() {
  const s = await getStubs()
  if (s instanceof NextResponse) return s
  const messages = await s.agent.list_messages()
  return NextResponse.json({ messages })
}

export async function DELETE() {
  const s = await getStubs()
  if (s instanceof NextResponse) return s
  await s.agent.clear_messages()
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest): Promise<Response> {
  const s = await getStubs()
  if (s instanceof NextResponse) return s
  const body = (await req.json().catch((): null => null)) as { messages?: unknown } | null
  if (!body || !Array.isArray(body.messages)) {
    return new NextResponse('messages[] required', { status: 400 })
  }
  return s.agent.chat(body.messages, s.ledger)
}
