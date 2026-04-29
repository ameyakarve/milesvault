'use client'

import { useRouter } from 'next/navigation'

export function NavRail() {
  const router = useRouter()

  return (
    <nav className="bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-6 w-[48px] h-screen shrink-0">
      <div className="w-8 h-8 bg-teal-500 flex items-center justify-center rounded-[6px] text-white font-black text-lg">
        M
      </div>
      <div className="flex flex-col gap-4">
        <div className="p-2 text-slate-400 hover:text-teal-500 transition-all cursor-pointer">
          <span className="material-symbols-outlined">dashboard</span>
        </div>
        <div className="p-2 text-slate-400 hover:text-teal-500 transition-all cursor-pointer">
          <span className="material-symbols-outlined">analytics</span>
        </div>
        <div className="p-2 text-slate-400 hover:text-teal-500 transition-all cursor-pointer">
          <span className="material-symbols-outlined">lightbulb</span>
        </div>
        <button
          type="button"
          onClick={() => router.push('/ledger')}
          className="p-2 cursor-pointer transition-all text-slate-400 hover:text-teal-500"
          aria-label="Accounts directory"
        >
          <span className="material-symbols-outlined">account_balance</span>
        </button>
      </div>
      <div className="mt-auto flex flex-col gap-4 items-center">
        <div className="p-2 text-slate-400 hover:text-teal-500 cursor-pointer">
          <span className="material-symbols-outlined">settings</span>
        </div>
      </div>
    </nav>
  )
}
