import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Sparkle } from '@phosphor-icons/react/dist/ssr'
import { NavRail } from '../_chrome/nav-rail'
import { StatusBar } from '../_chrome/status-bar'
import { ChatShell } from './chat-shell'

export default async function AiPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/ai')

  return (
    <div className="flex h-screen overflow-hidden bg-white pb-[28px]">
      <NavRail />
      <main className="flex flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-slate-200 px-6 py-4">
          <Sparkle size={20} weight="regular" className="text-teal-500" />
          <h1 className="text-sm font-semibold text-slate-900">AI</h1>
        </header>
        <ChatShell />
      </main>
      <StatusBar />
    </div>
  )
}
