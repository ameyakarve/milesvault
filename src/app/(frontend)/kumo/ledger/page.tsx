import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { KumoNavRail } from '../_chrome/kumo-nav-rail'
import { KumoAccountsDirectory } from './kumo-accounts-directory'

export default async function KumoLedgerIndex() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/kumo/ledger')
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex h-screen overflow-hidden bg-white pb-[28px]">
      <KumoNavRail />
      <KumoAccountsDirectory initialAsOf={today} />
    </div>
  )
}
