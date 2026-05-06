import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NavRail } from '../_chrome/nav-rail'
import { AccountsDirectory } from './accounts-directory'

export default async function LedgerIndexPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login?callbackUrl=/ledger')
  }
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex h-screen overflow-hidden bg-white pb-[28px]">
      <NavRail />
      <AccountsDirectory initialAsOf={today} />
    </div>
  )
}
