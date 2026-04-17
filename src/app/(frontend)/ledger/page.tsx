import { auth } from '@/auth'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { LedgerDO } from '@/durable/ledger-do'

async function loadTxnCount(email: string): Promise<number | string> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    const ns = env.LEDGER_DO as DurableObjectNamespace<LedgerDO> | undefined
    if (!ns) return 'DO binding not available'
    const stub = ns.get(ns.idFromName(email))
    const txns = await stub.list()
    return txns.length
  } catch (err) {
    return `DO error: ${(err as Error).message}`
  }
}

export default async function LedgerPage() {
  const session = await auth()
  const email = session!.user!.email!
  const count = await loadTxnCount(email)

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#FBFCFD]">
      <div className="bg-white border border-[#E4E8ED] rounded-lg p-8 w-full max-w-[480px] space-y-4 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Ledger</h1>
        <div>
          <div className="text-sm text-muted">Signed in as</div>
          <div className="font-mono text-sm">{email}</div>
        </div>
        <div>
          <div className="text-sm text-muted">Transactions in your DO</div>
          <div className="font-mono text-sm">{String(count)}</div>
        </div>
      </div>
    </main>
  )
}
