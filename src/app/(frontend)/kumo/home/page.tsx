import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { KumoNavRail } from '../_chrome/kumo-nav-rail'
import { KumoStatusBar } from '../_chrome/kumo-status-bar'

export default async function KumoHomePage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/kumo/home')

  return (
    <div className="flex h-screen overflow-hidden bg-kumo-recessed">
      <KumoNavRail />
      <div className="flex flex-1 flex-col">
        <header className="flex h-10 items-center border-b border-kumo-line bg-kumo-base px-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-kumo-default">
            MilesVault
          </span>
        </header>
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="text-center">
            <h1 className="mb-2 text-lg font-semibold text-kumo-default">
              Welcome back
            </h1>
            <p className="text-sm text-kumo-subtle">
              Pick an account from the sidebar to view its ledger.
            </p>
          </div>
        </main>
        <KumoStatusBar />
      </div>
    </div>
  )
}
