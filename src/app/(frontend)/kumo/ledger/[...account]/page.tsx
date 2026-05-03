import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { KumoNavRail } from '../../_chrome/kumo-nav-rail'
import { KumoStatusBar } from '../../_chrome/kumo-status-bar'
import { KumoPerAccountView } from './kumo-per-account-view'

export default async function KumoLedgerAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ account: string[] }>
  searchParams: Promise<{ ccy?: string }>
}) {
  const [{ account: segments }, { ccy }, session] = await Promise.all([
    params,
    searchParams,
    auth(),
  ])
  if (!session?.user) {
    redirect(`/login?callbackUrl=/kumo/ledger/${segments.join('/')}`)
  }
  const account = segments.join(':')

  return (
    <div className="flex h-screen overflow-hidden bg-kumo-recessed">
      <KumoNavRail />
      <div className="flex flex-1 flex-col">
        <KumoPerAccountView account={account} initialCurrency={ccy ?? null} />
        <KumoStatusBar secondary={account} />
      </div>
    </div>
  )
}
