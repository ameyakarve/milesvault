'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const TOP_LEVEL_ACCOUNTS = [
  { name: 'Assets', icon: 'savings' },
  { name: 'Liabilities', icon: 'credit_card' },
  { name: 'Equity', icon: 'account_balance' },
  { name: 'Income', icon: 'trending_up' },
  { name: 'Expenses', icon: 'shopping_cart' },
] as const

export function NavRail() {
  const router = useRouter()
  const [paneOpen, setPaneOpen] = useState(false)

  return (
    <>
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
            onClick={() => setPaneOpen((v) => !v)}
            className={`p-2 cursor-pointer transition-all ${
              paneOpen
                ? 'bg-teal-50 text-teal-600 border-r-2 border-teal-500'
                : 'text-slate-400 hover:text-teal-500'
            }`}
            aria-label="Toggle accounts"
            aria-pressed={paneOpen}
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

      {paneOpen && (
        <>
          <button
            type="button"
            aria-label="Close accounts"
            onClick={() => setPaneOpen(false)}
            className="fixed inset-0 z-40 bg-transparent cursor-default"
          />
          <aside
            className="fixed top-0 left-[48px] z-50 w-[264px] h-screen bg-[#F4F6F8] border-r border-[#E2E8F0] shadow-xl flex flex-col"
            role="dialog"
            aria-label="Account types"
          >
            <div className="p-4 border-b border-[#E2E8F0]">
              <div className="flex justify-between items-center">
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-900">
                  Accounts
                </h2>
                <button
                  type="button"
                  onClick={() => setPaneOpen(false)}
                  className="flex items-center gap-1 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  <span className="text-[14px] font-medium">Collapse</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {TOP_LEVEL_ACCOUNTS.map(({ name, icon }) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setPaneOpen(false)
                    router.push(`/ledger/${name}`)
                  }}
                  className="w-full px-4 py-2 hover:bg-[#F2F3FF] transition-colors cursor-pointer flex items-center gap-3 text-left"
                  title={name}
                >
                  <span className="material-symbols-outlined !text-[18px] text-slate-500">
                    {icon}
                  </span>
                  <span className="text-[12px] font-medium text-slate-700 truncate">{name}</span>
                </button>
              ))}
            </div>
          </aside>
        </>
      )}
    </>
  )
}
