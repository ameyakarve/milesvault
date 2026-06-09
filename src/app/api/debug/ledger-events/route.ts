import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { auth } from '@/auth'
import type { LedgerDO } from '@/durable/ledger-do'

export const dynamic = 'force-dynamic'

// F1 step-2 operability (f1-implementation.md §6): inspect and drive the
// event-log projector on your own ledger.
//   GET  → non-destructive replay-parity report (verify_replay_parity).
//   POST {"action":"bootstrap"} → clear the log, synthesize posted events
//                                 from the live entries (one-time, pre-cutover).
//   POST {"action":"rebuild"}   → destructive full replay of the projection
//                                 tables from the log. Run parity first.

async function stubFor(email: string) {
  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).LEDGER_DO as DurableObjectNamespace<LedgerDO> | undefined
  if (!ns) return null
  return ns.get(ns.idFromName(email))
}

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
  const stub = await stubFor(session.user.email)
  if (!stub) return new NextResponse('LEDGER_DO binding missing', { status: 500 })
  return NextResponse.json(await stub.verify_replay_parity())
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('unauthorized', { status: 401 })
  const stub = await stubFor(session.user.email)
  if (!stub) return new NextResponse('LEDGER_DO binding missing', { status: 500 })

  let action: string
  try {
    const body = (await req.json()) as { action?: string }
    action = body.action ?? ''
  } catch {
    return new NextResponse('expected JSON body {"action": "bootstrap" | "rebuild"}', { status: 400 })
  }
  if (action === 'bootstrap') return NextResponse.json(await stub.bootstrap_event_log())
  if (action === 'rebuild') return NextResponse.json(await stub.rebuild_from_events())
  return new NextResponse('unknown action — use "bootstrap" or "rebuild"', { status: 400 })
}
