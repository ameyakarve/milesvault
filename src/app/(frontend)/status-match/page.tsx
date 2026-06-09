import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NavRail } from '../_chrome/nav-rail'
import { StatusMatchView } from './status-match-view'

export const dynamic = 'force-dynamic'

export default async function StatusMatchPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/status-match')

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[#fbfbfa]">
      <NavRail />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <StatusMatchView />
      </main>
    </div>
  )
}
