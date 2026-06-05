import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NavRail } from '../_chrome/nav-rail'
import { ConciergeChat } from './chat'

export default async function ConciergePage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/concierge')

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[#fbfbfa]">
      <NavRail />
      <main className="flex flex-1 flex-col">
        <ConciergeChat />
      </main>
    </div>
  )
}
