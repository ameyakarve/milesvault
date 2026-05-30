import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NavRail } from '../_chrome/nav-rail'
import { StatusBar } from '../_chrome/status-bar'
import { ConciergeChat } from './chat'

export default async function ConciergePage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/concierge')

  return (
    <div className="flex h-screen overflow-hidden bg-[#fbfbfa] pb-[28px]">
      <NavRail />
      <main className="flex flex-1 flex-col">
        <ConciergeChat />
      </main>
      <StatusBar />
    </div>
  )
}
