import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NavRail } from '../_chrome/nav-rail'
import { SettingsView } from './settings-view'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/settings')

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
      <NavRail />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <SettingsView email={session.user.email ?? null} />
      </main>
    </div>
  )
}
