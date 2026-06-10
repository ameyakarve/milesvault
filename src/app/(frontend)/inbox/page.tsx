import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NavRail } from '../_chrome/nav-rail'
import { InboxView } from './inbox-view'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/inbox')

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
      <NavRail />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <InboxView />
      </main>
    </div>
  )
}
