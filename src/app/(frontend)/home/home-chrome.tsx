'use client'

import React, { useState } from 'react'

export function HomeChrome() {
  const [paneOpen, setPaneOpen] = useState(false)

  return (
    <div className="bg-[#F4F6F8] h-screen flex overflow-hidden font-sans text-slate-900">
      {/* SideNavBar: Icon Rail */}
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
          <img
            alt="User Profile"
            className="w-8 h-8 rounded-full border border-[#E2E8F0]"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCOxr9-cU_KoE3CTmQRvSN_wIp719XCoH9ppHvA_l4dQDxOMM-r9-Ca6qrHjTd9J_gl5oKyz6acsIrSOU8dSFwAwdgjsZhEjY3dTxEixtDirpFrYSfobRVvh37iigiwiz7RNqTtEewLZoLtDfC30BiQTPR-i4G7B0lVfa0JVjISb2ErV3aPpI0HdB8DPMxKVbFwqS2FPlOoYIWkEp7d33yXark6x6nhgm8dW6lgdR9J-LGDRZ-S1AvaMMrad9TrWfeWMRmte_kFQ-N4"
          />
        </div>
      </nav>

      {/* List Pane (Accounts) */}
      {paneOpen && (
        <aside className="w-[264px] bg-[#F4F6F8] border-r border-[#E2E8F0] flex flex-col shrink-0">
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
            <div className="mt-3 relative">
              <span className="material-symbols-outlined absolute left-2 top-1.5 text-[16px] text-slate-400">
                search
              </span>
              <input
                className="w-full bg-white border border-[#E2E8F0] text-[11px] pl-8 py-1.5 rounded-[6px] focus:ring-0 focus:border-teal-500"
                placeholder="Filter accounts..."
                type="text"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {/* Group: Pinned */}
            <div className="px-4 py-2 flex justify-between items-center group">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Pinned
              </div>
              <span className="material-symbols-outlined text-[14px] text-slate-300 opacity-0 group-hover:opacity-100 cursor-pointer hover:text-slate-500">
                edit
              </span>
            </div>
            <div className="px-4 py-2 bg-teal-50 text-teal-900 border-r-4 border-teal-500 cursor-pointer flex justify-between items-center">
              <span className="text-[12px] font-medium">HDFC Diners Black</span>
            </div>
            <div className="px-4 py-2 hover:bg-[#F2F3FF] transition-colors cursor-pointer flex justify-between items-center group">
              <span className="text-[12px] font-medium text-slate-700">HDFC Savings</span>
            </div>
            <div className="px-4 py-2 hover:bg-[#F2F3FF] transition-colors cursor-pointer flex justify-between items-center group">
              <span className="text-[12px] font-medium text-slate-700">ICICI Amazon Pay</span>
            </div>

            {/* Group: Recent */}
            <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-2">
              Recent
            </div>
            <div className="px-4 py-2 hover:bg-[#F2F3FF] transition-colors cursor-pointer flex justify-between items-center group">
              <span className="text-[12px] font-medium text-slate-700">Paytm Wallet</span>
            </div>
            <div className="px-4 py-2 hover:bg-[#F2F3FF] transition-colors cursor-pointer flex justify-between items-center group">
              <span className="text-[12px] font-medium text-slate-700">HDFC Multicurrency</span>
            </div>
            <div className="px-4 py-2 hover:bg-[#F2F3FF] transition-colors cursor-pointer flex justify-between items-center group">
              <span className="text-[12px] font-medium text-slate-700">Cash Wallet</span>
            </div>

            {/* Group: All Accounts */}
            <div className="px-4 py-2 flex items-center gap-1 cursor-pointer hover:bg-slate-100 transition-colors mt-2">
              <span className="material-symbols-outlined text-[14px] text-slate-400">
                arrow_right
              </span>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                All Accounts
              </div>
            </div>
            {/* Expanded Group: Loyalty */}
            <div className="px-4 py-2 flex items-center gap-1 cursor-pointer hover:bg-slate-100 transition-colors">
              <span className="material-symbols-outlined text-[14px] text-slate-400">
                arrow_drop_down
              </span>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Loyalty
              </div>
            </div>
            <div className="pl-8 pr-4 py-2 hover:bg-[#F2F3FF] transition-colors cursor-pointer flex justify-between items-center group">
              <span className="text-[12px] font-medium text-slate-700">Marriott Bonvoy</span>
            </div>
            {/* Collapsed Groups */}
            <div className="px-4 py-2 flex items-center gap-1 cursor-pointer hover:bg-slate-100 transition-colors">
              <span className="material-symbols-outlined text-[14px] text-slate-400">
                arrow_right
              </span>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Bank &amp; Cash
              </div>
            </div>
            <div className="px-4 py-2 flex items-center gap-1 cursor-pointer hover:bg-slate-100 transition-colors">
              <span className="material-symbols-outlined text-[14px] text-slate-400">
                arrow_right
              </span>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Credit Cards
              </div>
            </div>
            <div className="px-4 py-2 flex items-center gap-1 cursor-pointer hover:bg-slate-100 transition-colors">
              <span className="material-symbols-outlined text-[14px] text-slate-400">
                arrow_right
              </span>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Wallets &amp; Prepaid
              </div>
            </div>
            <div className="px-4 py-2 flex items-center gap-1 cursor-pointer hover:bg-slate-100 transition-colors">
              <span className="material-symbols-outlined text-[14px] text-slate-400">
                arrow_right
              </span>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Forex
              </div>
            </div>
            <div className="px-4 py-2 flex items-center gap-1 cursor-pointer hover:bg-slate-100 transition-colors">
              <span className="material-symbols-outlined text-[14px] text-slate-400">
                arrow_right
              </span>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Status Tracking
              </div>
              <span className="material-symbols-outlined text-[14px] text-teal-600 ml-auto hover:bg-teal-50 rounded-full">
                add
              </span>
            </div>
          </div>
        </aside>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TopAppBar (Chrome Strip) */}
        <header className="bg-slate-50 border-b border-slate-200 flex justify-between items-center w-full px-4 h-8 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-['Inter'] font-black text-slate-900 text-[10px] uppercase tracking-widest">
              MilesVault
            </span>
            <span className="text-slate-300 text-[10px]">|</span>
            <span className="text-[11px] font-medium text-slate-500">
              Accounts → HDFC Diners Black
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500"></div>
              <span className="data-mono text-[10px] text-slate-500">Saved · 12:42</span>
            </div>
            <div className="flex items-center justify-between min-w-[160px] text-[11px] text-slate-400 font-mono bg-white px-2 py-0.5 border border-slate-200 rounded-[6px] cursor-pointer hover:bg-slate-100 focus-within:ring-2 focus-within:ring-teal-500/40">
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">search</span>
                <span>Search</span>
              </div>
              <span className="bg-slate-100 border border-slate-200 rounded px-1 text-[9px] text-slate-500">
                ⌘K
              </span>
            </div>
          </div>
        </header>

        {/* Ledger Column */}
        <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {/* Header Card */}
          <div className="bg-white p-6 border border-[#E2E8F0] rounded-[6px] shadow-sm">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Liabilities:CreditCard:HDFC:DinersBlack
              </div>
              <div className="flex gap-2 mb-4">
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-bold rounded-[6px] uppercase tracking-wider">
                  Credit Card
                </span>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-bold rounded-[6px] uppercase tracking-wider">
                  INR
                </span>
              </div>
            </div>
            <div className="border-t border-[#E2E8F0] pt-3 mt-3 grid grid-cols-3 gap-4">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Current Balance
                </div>
                <div className="data-mono text-[14px] font-bold text-slate-900">-₹47,820.00</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Statement Due
                </div>
                <div className="data-mono text-[14px] font-bold text-slate-900">04 May 2024</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Available Credit
                </div>
                <div className="data-mono text-[14px] font-bold text-slate-900">₹2,52,180.00</div>
              </div>
            </div>
          </div>

          {/* Ledger Grid */}
          <div className="bg-white border border-[#E2E8F0] rounded-[6px] overflow-hidden">
            <div className="grid grid-cols-[100px_1fr_120px_120px_120px] bg-[#F4F6F8] border-b border-[#E2E8F0] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <div>Date</div>
              <div>Payee · Narration</div>
              <div className="text-right">Debit</div>
              <div className="text-right">Credit</div>
              <div className="text-right">Balance</div>
            </div>
            <div className="grid grid-cols-[100px_1fr_120px_120px_120px] px-4 py-3 border-b border-[#E2E8F0] hover:bg-[#F2F3FF] transition-colors items-center">
              <div className="data-mono text-[12px] text-slate-500">2024-04-20</div>
              <div className="text-[12.5px] font-medium text-slate-900 truncate">
                Amazon India · Cloud Services
              </div>
              <div className="data-mono text-[12px] text-right text-slate-900">4,200.00</div>
              <div className="data-mono text-[12px] text-right text-slate-400">—</div>
              <div className="data-mono text-[12px] text-right text-slate-600">-47,820.00</div>
            </div>
            <div className="bg-teal-50 border-l-4 border-teal-500">
              <div className="grid grid-cols-[100px_1fr_120px_120px_120px] px-4 py-3 items-center">
                <div className="data-mono text-[12px] font-bold text-teal-600">2024-04-18</div>
                <div className="text-[12.5px] font-bold text-slate-900">Lufthansa · Flight Ticket</div>
                <div className="data-mono text-[12px] text-right font-bold text-slate-900">
                  38,500.00
                </div>
                <div className="data-mono text-[12px] text-right text-slate-400">—</div>
                <div className="data-mono text-[12px] text-right text-slate-600">-43,620.00</div>
              </div>
              <div className="px-4 pb-4">
                <div className="bg-slate-950 p-3 rounded-[6px] font-mono text-[11px] text-teal-400 leading-relaxed">
                  2024-04-18 * &quot;Lufthansa&quot; &quot;FRA-BLR Return&quot;
                  <br />
                  &nbsp;&nbsp;Liabilities:CreditCard:HDFC:DinersBlack&nbsp;&nbsp;38,500.00 INR
                  <br />
                  &nbsp;&nbsp;Expenses:Travel:Airfare
                </div>
              </div>
            </div>
            <div className="grid grid-cols-[100px_1fr_120px_120px_120px] px-4 py-3 border-b border-[#E2E8F0] hover:bg-[#F2F3FF] transition-colors items-center">
              <div className="data-mono text-[12px] text-slate-500">2024-04-15</div>
              <div className="text-[12.5px] font-medium text-slate-900 truncate">
                Starbucks · Coffee
              </div>
              <div className="data-mono text-[12px] text-right text-slate-900">450.00</div>
              <div className="data-mono text-[12px] text-right text-slate-400">—</div>
              <div className="data-mono text-[12px] text-right text-slate-600">-5,120.00</div>
            </div>
            <div className="grid grid-cols-[100px_1fr_120px_120px_120px] px-4 py-3 border-b border-[#E2E8F0] hover:bg-[#F2F3FF] transition-colors items-center">
              <div className="data-mono text-[12px] text-slate-500">2024-04-12</div>
              <div className="text-[12.5px] font-medium text-slate-900 truncate">
                HDFC Bank · Reward Points Redem...
              </div>
              <div className="data-mono text-[12px] text-right text-slate-400">—</div>
              <div className="data-mono text-[12px] text-right text-teal-600">2,500.00</div>
              <div className="data-mono text-[12px] text-right text-slate-600">-4,670.00</div>
            </div>
          </div>
        </main>
      </div>

      {/* AI Rail (Right) */}
      <aside className="w-[360px] bg-slate-50 border-l border-[#E2E8F0] flex flex-col shrink-0">
        <div className="p-4 border-b border-[#E2E8F0] flex items-center gap-3">
          <div className="w-8 h-8 rounded-[6px] bg-teal-100 flex items-center justify-center text-teal-600">
            <span className="material-symbols-outlined">receipt</span>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase">Thu 18 Apr</div>
            <div className="text-[13px] font-bold text-slate-900">Lufthansa</div>
          </div>
        </div>
        <div className="p-6 flex flex-col gap-6 overflow-y-auto">
          <div className="bg-white p-4 border border-[#E2E8F0] rounded-[6px] shadow-sm">
            <div className="text-[11px] font-bold uppercase text-teal-600 mb-3 tracking-widest">
              Context
            </div>
            <p className="text-[12px] leading-relaxed text-slate-600">
              Posted to Liabilities:CreditCard:HDFC:DinersBlack with offsetting
              Expenses:Travel:Airfare. Single-currency (INR) account.
            </p>
          </div>
          <div className="bg-teal-50/50 p-4 border border-teal-100 rounded-[6px]">
            <div className="text-[11px] font-bold uppercase text-teal-700 mb-2">Validation</div>
            <div className="flex gap-2 items-center mb-2">
              <span className="material-symbols-outlined text-green-500 text-[18px]">
                check_circle
              </span>
              <span className="text-[11px] text-slate-700">Beancount syntax: valid</span>
            </div>
            <div className="flex gap-2 items-center">
              <span className="material-symbols-outlined text-green-500 text-[18px]">
                check_circle
              </span>
              <span className="text-[11px] text-slate-700">Postings balance to zero</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
