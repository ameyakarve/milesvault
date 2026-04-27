'use client'

import { NavRail } from '../_chrome/nav-rail'

export function HomeChrome() {
  return (
    <div className="bg-[#F4F6F8] h-screen flex overflow-hidden font-sans text-slate-900">
      <NavRail />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-slate-50 border-b border-slate-200 flex items-center w-full px-4 h-8 shrink-0">
          <span className="font-['Inter'] font-black text-slate-900 text-[10px] uppercase tracking-widest">
            MilesVault
          </span>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-[14px] text-slate-500">
              Pick an account from Recent Accounts to view its ledger.
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
