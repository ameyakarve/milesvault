'use client'

import Link from 'next/link'

const TOP_LEVEL_ACCOUNTS = [
  { name: 'Assets', icon: 'savings' },
  { name: 'Liabilities', icon: 'credit_card' },
  { name: 'Equity', icon: 'account_balance' },
  { name: 'Income', icon: 'trending_up' },
  { name: 'Expenses', icon: 'shopping_cart' },
] as const

export function NavRail() {
  return (
    <nav className="bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-6 w-[48px] h-screen shrink-0">
      <div className="w-8 h-8 bg-teal-500 flex items-center justify-center rounded-[6px] text-white font-black text-lg">
        M
      </div>
      <div className="flex flex-col gap-4">
        {TOP_LEVEL_ACCOUNTS.map(({ name, icon }) => (
          <Link
            key={name}
            href={`/ledger/${name}`}
            title={name}
            aria-label={name}
            className="p-2 text-slate-400 hover:text-teal-500 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined">{icon}</span>
          </Link>
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-4 items-center">
        <div className="p-2 text-slate-400 hover:text-teal-500 cursor-pointer">
          <span className="material-symbols-outlined">settings</span>
        </div>
      </div>
    </nav>
  )
}
