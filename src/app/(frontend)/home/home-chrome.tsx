'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { splitCamel } from '@/lib/beancount/account-display'
import { useRecentAccounts } from './use-accounts'

const TOP_LEVELS = ['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses'] as const

const EMPTY_ACCOUNTS: readonly string[] = []

function displayAccountName(path: string): string {
  const parts = path.split(':').filter(Boolean)
  if (parts.length === 0) return path
  const rest = (TOP_LEVELS as readonly string[]).includes(parts[0]) ? parts.slice(1) : parts
  const tail = rest.length >= 2 ? rest.slice(-2) : rest
  return tail.map(splitCamel).join(' ')
}

export function HomeChrome() {
  const router = useRouter()
  const accountsQuery = useRecentAccounts()
  const accounts = accountsQuery.data?.accounts ?? EMPTY_ACCOUNTS
  const hasRecents = accounts.length > 0
  const [paneOpen, setPaneOpen] = useState(false)

  return (
    <div className="bg-[#F4F6F8] h-screen flex overflow-hidden font-sans text-slate-900">
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
                    router.push(`/ledger/${acc.split(':').map(encodeURIComponent).join('/')}`)
                  }}
                  className="w-full px-4 py-2 hover:bg-[#F2F3FF] transition-colors cursor-pointer flex justify-between items-center text-left"
                  title={acc}
                >
                  <span className="text-[12px] font-medium text-slate-700 truncate">
                    {displayAccountName(acc)}
                  </span>
                </button>
              ))}
            </div>
          </aside>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-slate-50 border-b border-slate-200 flex items-center w-full px-4 h-8 shrink-0">
          <span className="font-['Inter'] font-black text-slate-900 text-[10px] uppercase tracking-widest">
            MilesVault
          </span>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-[14px] text-slate-500 mb-2">
              Pick an account from Recent Accounts to view its ledger.
            </div>
            <button
              type="button"
              onClick={() => setPaneOpen(true)}
              className="text-[12px] text-teal-600 hover:text-teal-700 cursor-pointer underline"
            >
              Open Recent Accounts
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}
