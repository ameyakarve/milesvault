import { auth } from '@/auth'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { LedgerDO, Transaction } from '@/durable/ledger-do'
import { LedgerView, type Txn as UITxn } from './ledger-view'

async function loadTxns(email: string): Promise<Transaction[]> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    const ns = env.LEDGER_DO as DurableObjectNamespace<LedgerDO> | undefined
    if (!ns) {
      console.warn('[ledger] LEDGER_DO binding missing')
      return []
    }
    const stub = ns.get(ns.idFromName(email))
    return await stub.list()
  } catch (err) {
    console.error('[ledger] DO read failed:', (err as Error).message)
    return []
  }
}

function toProseTxn(t: Transaction): UITxn {
  return {
    kind: 'prose',
    id: String(t.id),
    date: new Date(t.created_at).toISOString().slice(0, 10),
    body: t.raw_text,
  }
}

export default async function LedgerPage() {
  const session = await auth()
  const email = session!.user!.email!
  const rows = await loadTxns(email)
  const txns = rows.map(toProseTxn)

  return <LedgerView txns={txns} email={email} />
}
