'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { shortAccountName } from '@/lib/beancount/account-display'
import { useRecentAccounts } from '../home/use-accounts'

const EMPTY_ACCOUNTS: readonly string[] = []

export function NavRail() {
  const router = useRouter()
  const [paneOpen, setPaneOpen] = useState(false)
  const accountsQuery = useRecentAccounts(10, paneOpen)
  const accounts = accountsQuery.data?.accounts ?? EMPTY_ACCOUNTS
  const hasRecents = accounts.length > 0

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
            aria-label="Recent accounts"
          >
            <div className="p-4 border-b border-[#E2E8F0]">
              <div className="flex justify-between items-center">
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-900">
                  Recent Accounts
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
              {!hasRecents && (
                <div className="px-4 py-3 text-[11px] text-slate-400">No recent accounts yet.</div>
              )}
              {accounts.map((acc) => (
                <button
                  key={acc}
                  type="button"
                  onClick={() => {
                    void accountsQuery.touch(acc)
                    setPaneOpen(false)
                    router.push(`/ledger/${acc.split(':').map(encodeURIComponent).join('/')}`)
                  }}
                  className="w-full px-4 py-2 hover:bg-[#F2F3FF] transition-colors cursor-pointer flex justify-between items-center text-left"
                  title={acc}
                >
                  <span className="text-[12px] font-medium text-slate-700 truncate">
                    {shortAccountName(acc)}
                  </span>
                </button>
              ))}
            </div>
          </aside>
        </>
      )}
    </>
  )
}
