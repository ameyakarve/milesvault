import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NavRail } from '../../_chrome/nav-rail'
import { AccountOverviewView } from './overview-view'

export const dynamic = 'force-dynamic'

export default async function AccountOverviewPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/vault/account')

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[#fbfbfa]">
      <NavRail />
      <main className="flex flex-1 flex-col overflow-y-auto">
        <AccountOverviewView />
      </main>
    </div>
  )
}
