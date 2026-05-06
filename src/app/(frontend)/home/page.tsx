import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NavRail } from '../_chrome/nav-rail'
import { StatusBar } from '../_chrome/status-bar'

export default async function HomePage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/home')

  return (
    <div className="flex h-screen overflow-hidden bg-white pb-[28px]">
      <NavRail />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <h1 className="mb-2 text-lg font-semibold text-slate-900">
            Welcome back
          </h1>
          <p className="text-sm text-slate-500">
            Pick an account from the sidebar to view its ledger.
          </p>
        </div>
      </main>
      <StatusBar />
    </div>
  )
}
