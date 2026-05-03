import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { KumoNavRail } from '../_chrome/kumo-nav-rail'
import { KumoStatusBar } from '../_chrome/kumo-status-bar'
import { KumoAccountsDirectory } from './kumo-accounts-directory'

export default async function KumoLedgerIndex() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/kumo/ledger')
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex h-screen overflow-hidden bg-kumo-recessed">
      <KumoNavRail />
      <KumoAccountsDirectory initialAsOf={today} />
      <KumoStatusBar />
    </div>
  )
}
