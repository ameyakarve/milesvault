import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Database } from '@phosphor-icons/react/dist/ssr'
import { NavRail } from '../../_chrome/nav-rail'
import { StatusBar } from '../../_chrome/status-bar'
import { SqlConsole } from './sql-console'

const ALLOWLIST = new Set(['ameya.karve@gmail.com'])

export default async function DevSqlPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login?callbackUrl=/dev/sql')
  if (!ALLOWLIST.has(session.user.email)) redirect('/home')

  return (
    <div className="flex h-screen overflow-hidden bg-white pb-[28px]">
      <NavRail />
      <main className="flex flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-slate-200 px-6 py-4">
          <Database size={20} weight="regular" className="text-teal-500" />
          <h1 className="text-sm font-semibold text-slate-900">SQL</h1>
          <span className="text-xs text-rose-500">writes allowed · your own ledger</span>
        </header>
        <SqlConsole />
      </main>
      <StatusBar />
    </div>
  )
}
