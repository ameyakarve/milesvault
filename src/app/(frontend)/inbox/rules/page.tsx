import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NavRail } from '../../_chrome/nav-rail'
import { RulesView } from './rules-view'

export const dynamic = 'force-dynamic'

export default async function InboxRulesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/inbox/rules')

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[#fbfbfa]">
      <NavRail />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <RulesView />
      </main>
    </div>
  )
}
