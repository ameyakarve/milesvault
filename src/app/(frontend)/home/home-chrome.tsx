import React from 'react'

const PIN_FILLED = { fontVariationSettings: "'FILL' 1" } as const

export function HomeChrome() {
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
          <div className="p-2 bg-teal-50 text-teal-600 border-r-2 border-teal-500 cursor-pointer">
            <span className="material-symbols-outlined">account_balance</span>
          </div>
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
      <aside className="w-[264px] bg-[#F4F6F8] border-r border-[#E2E8F0] flex flex-col shrink-0">
        <div className="p-4 border-b border-[#E2E8F0]">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-900">Accounts</h2>
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
        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Section 1: Pinned */}
          <div className="pt-2">
            <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Pinned
            </div>
            <div className="px-4 py-2 flex justify-between items-center bg-teal-50 border-r-4 border-teal-500 cursor-pointer">
              <span className="text-[12px] font-medium text-teal-900">HDFC Diners Black</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-teal-700">-₹47,820</span>
                <span
                  className="material-symbols-outlined text-[14px] text-teal-500"
                  style={PIN_FILLED}
                >
                  push_pin
                </span>
              </div>
            </div>
            <div className="px-4 py-2 flex justify-between items-center hover:bg-[#F2F3FF] transition-colors cursor-pointer group">
              <span className="text-[12px] font-medium text-slate-700">ICICI Savings</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-500 group-hover:text-slate-900">
                  ₹1,24,500
                </span>
                <span
                  className="material-symbols-outlined text-[14px] text-slate-300 group-hover:text-teal-500"
                  style={PIN_FILLED}
                >
                  push_pin
                </span>
              </div>
            </div>
            <div className="px-4 py-2 flex justify-between items-center hover:bg-[#F2F3FF] transition-colors cursor-pointer group">
              <span className="text-[12px] font-medium text-slate-700">Axis Forex</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-500 group-hover:text-slate-900">
                  $2,450
                </span>
                <span
                  className="material-symbols-outlined text-[14px] text-slate-300 group-hover:text-teal-500"
                  style={PIN_FILLED}
                >
                  push_pin
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Recent */}
          <div className="border-t border-slate-100 pt-2 mt-2">
            <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Recent
            </div>
            <div className="px-4 py-2 flex justify-between items-center hover:bg-[#F2F3FF] transition-colors cursor-pointer group">
              <span className="text-[12px] font-medium text-slate-700">Amazon Pay</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-500 group-hover:text-slate-900">
                  ₹4,200
                </span>
                <span className="text-[10px] text-slate-400">2h</span>
              </div>
            </div>
            <div className="px-4 py-2 flex justify-between items-center hover:bg-[#F2F3FF] transition-colors cursor-pointer group">
              <span className="text-[12px] font-medium text-slate-700">Zomato Wallet</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-500 group-hover:text-slate-900">
                  ₹850
                </span>
                <span className="text-[10px] text-slate-400">yest</span>
              </div>
            </div>
            <div className="px-4 py-2 flex justify-between items-center hover:bg-[#F2F3FF] transition-colors cursor-pointer group">
              <span className="text-[12px] font-medium text-slate-700">SBI Savings</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-500 group-hover:text-slate-900">
                  ₹45,200
                </span>
                <span className="text-[10px] text-slate-400">3d</span>
              </div>
            </div>
            <div className="px-4 py-2 flex justify-between items-center hover:bg-[#F2F3FF] transition-colors cursor-pointer group">
              <span className="text-[12px] font-medium text-slate-700">HDFC Regalia</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-500 group-hover:text-slate-900">
                  -₹12,400
                </span>
                <span className="text-[10px] text-slate-400">5d</span>
              </div>
            </div>
          </div>

          {/* Section 3: All Accounts */}
          <div className="border-t border-slate-100 pt-2 mt-2 pb-4">
            <div className="px-4 pt-3 pb-1 flex justify-between items-center cursor-pointer group">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-slate-700">
                All Accounts
              </span>
              <span className="material-symbols-outlined text-[16px] text-slate-400 group-hover:text-slate-700 transition-transform">
                expand_more
              </span>
            </div>
            <div className="mt-1">
              <div className="px-4 py-1 flex justify-between items-center cursor-pointer hover:bg-[#F2F3FF]">
                <span className="text-[11px] font-semibold text-slate-600">Bank &amp; Cash</span>
                <span className="material-symbols-outlined text-[14px] text-slate-400">
                  expand_less
                </span>
              </div>
              <div className="px-4 py-1.5 flex justify-between items-center hover:bg-[#F2F3FF] transition-colors cursor-pointer group pl-6">
                <span className="text-[12px] font-medium text-slate-700">HDFC Salary</span>
                <span className="text-[11px] font-mono text-slate-500 group-hover:text-slate-900">
                  ₹84,500
                </span>
              </div>
              <div className="px-4 py-1.5 flex justify-between items-center hover:bg-[#F2F3FF] transition-colors cursor-pointer group pl-6">
                <span className="text-[12px] font-medium text-slate-700">Cash Wallet</span>
                <span className="text-[11px] font-mono text-slate-500 group-hover:text-slate-900">
                  ₹3,200
                </span>
              </div>
            </div>
            <div className="px-4 py-1.5 flex justify-between items-center cursor-pointer hover:bg-[#F2F3FF]">
              <span className="text-[11px] font-medium text-slate-600">Credit Cards · 6</span>
              <span className="material-symbols-outlined text-[14px] text-slate-400">
                expand_more
              </span>
            </div>
            <div className="px-4 py-1.5 flex justify-between items-center cursor-pointer hover:bg-[#F2F3FF]">
              <span className="text-[11px] font-medium text-slate-600">Wallets &amp; Prepaid · 4</span>
              <span className="material-symbols-outlined text-[14px] text-slate-400">
                expand_more
              </span>
            </div>
            <div className="px-4 py-1.5 flex justify-between items-center cursor-pointer hover:bg-[#F2F3FF]">
              <span className="text-[11px] font-medium text-slate-600">Forex · 2</span>
              <span className="material-symbols-outlined text-[14px] text-slate-400">
                expand_more
              </span>
            </div>
            <div className="px-4 py-1.5 flex justify-between items-center cursor-pointer hover:bg-[#F2F3FF]">
              <span className="text-[11px] font-medium text-slate-600">Loyalty · 3</span>
              <span className="material-symbols-outlined text-[14px] text-slate-400">
                expand_more
              </span>
            </div>
            <div className="px-4 py-1.5 flex justify-between items-center cursor-pointer hover:bg-[#F2F3FF]">
              <span className="text-[11px] font-medium text-slate-600">Status Tracking · 2</span>
              <span className="material-symbols-outlined text-[14px] text-slate-400">
                expand_more
              </span>
            </div>
            <div className="mx-4 mt-3 border-t border-dashed border-[#E2E8F0] pt-2 text-center text-[11px] font-medium text-slate-400 cursor-pointer hover:text-teal-600 transition-colors">
              + Add account
            </div>
          </div>
        </div>
        {/* Sticky Footer */}
        <div className="p-4 border-t border-[#E2E8F0] bg-[#F4F6F8] flex justify-between items-center shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Net Worth
          </span>
          <span className="text-[12px] font-bold font-mono text-slate-900">₹2,33,820</span>
        </div>
      </aside>

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
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500"></div>
              <span className="text-[10px] font-medium text-slate-500">Saved · 12:42</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono bg-white px-2 py-0.5 border border-slate-200 rounded-[6px] hover:bg-slate-100 transition-colors focus-within:ring-2 focus-within:ring-teal-500 min-w-[120px] cursor-pointer">
              <span className="material-symbols-outlined text-[14px]">search</span>
              <span>⌘K Search</span>
            </div>
          </div>
        </header>

        {/* Empty content area */}
        <main className="flex-1 overflow-y-auto" />
      </div>
    </div>
  )
}
