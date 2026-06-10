import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NavRail } from '../_chrome/nav-rail'
import { VaultView } from './vault-view'

export const dynamic = 'force-dynamic'

export default async function VaultPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/vault')

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
      <NavRail />
      <main className="flex flex-1 flex-col overflow-y-auto">
        <VaultView />
      </main>
    </div>
  )
}
