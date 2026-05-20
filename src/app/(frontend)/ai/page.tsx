import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Sparkle } from '@phosphor-icons/react/dist/ssr'
import { NavRail } from '../_chrome/nav-rail'
import { StatusBar } from '../_chrome/status-bar'

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

        <section className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-[8px] bg-teal-500 text-white">
              <Sparkle size={20} weight="regular" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">
              Ask the agent anything
            </h2>
            <p className="text-sm text-slate-500">
              A generative UI mode. Describe what you want to see or do, and the
              agent will build the interface around the answer.
            </p>
          </div>
        </section>

        <footer className="border-t border-slate-200 px-6 py-4">
          <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-[8px] border border-slate-200 bg-white px-3 py-2">
            <input
              type="text"
              disabled
              placeholder="Message the agent…"
              className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none disabled:cursor-not-allowed"
            />
            <button
              type="button"
              disabled
              className="rounded-[6px] bg-teal-500 px-3 py-1 text-xs font-semibold text-white opacity-60"
            >
              Send
            </button>
          </div>
        </footer>
      </main>
      <StatusBar />
    </div>
  )
}
