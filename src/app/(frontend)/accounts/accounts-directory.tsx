'use client'

import React, { useMemo, useState } from 'react'
import { NavRail } from '../_chrome/nav-rail'

export type AccountKind = 'Assets' | 'Liabilities' | 'Equity' | 'Income' | 'Expenses'

export type AccountRow = {
  path: string
  currency: string
  balance: number
  lastActivity: string | null
}

const CHIPS: ('All' | AccountKind)[] = [
  'All',
  'Assets',
  'Liabilities',
  'Equity',
  'Income',
  'Expenses',
]

const CURRENCY_FORMAT: Record<string, { locale: string; min: number; max: number }> = {
  INR: { locale: 'en-IN', min: 2, max: 2 },
  USD: { locale: 'en-US', min: 2, max: 2 },
  EUR: { locale: 'de-DE', min: 2, max: 2 },
  GBP: { locale: 'en-GB', min: 2, max: 2 },
  CNY: { locale: 'en-US', min: 2, max: 2 },
  AVIOS: { locale: 'en-US', min: 0, max: 0 },
  BTC: { locale: 'en-US', min: 8, max: 8 },
}

function formatBalance(amount: number, currency: string): string {
  const meta = CURRENCY_FORMAT[currency] ?? { locale: 'en-US', min: 2, max: 2 }
  const grouped = new Intl.NumberFormat(meta.locale, {
    minimumFractionDigits: meta.min,
    maximumFractionDigits: meta.max,
  }).format(Math.abs(amount))
  if (amount === 0) return grouped
  return amount > 0 ? `+${grouped}` : `−${grouped}`
}

function classifyKind(path: string): AccountKind | null {
  const head = path.split(':')[0]
  if (
    head === 'Assets' ||
    head === 'Liabilities' ||
    head === 'Equity' ||
    head === 'Income' ||
    head === 'Expenses'
  ) {
    return head
  }
  return null
}

function AccountPath({ path }: { path: string }) {
  const segs = path.split(':')
  const leaf = segs.pop() ?? ''
  return (
    <>
      {segs.length > 0 && (
        <span className="text-slate-400 font-normal">
          {segs.map((s, i) => (
            <React.Fragment key={i}>
              {s}
              <span className="text-slate-400">:</span>
            </React.Fragment>
          ))}
        </span>
      )}
      <span className="text-slate-900 font-semibold">{leaf}</span>
    </>
  )
}

export type AccountsDirectoryProps = {
  rows: AccountRow[]
  recentPath?: string | null
  initialAsOf?: string
}

export function AccountsDirectory({
  rows,
  recentPath = null,
  initialAsOf,
}: AccountsDirectoryProps) {
  const today = new Date().toISOString().slice(0, 10)
  const [asOf, setAsOf] = useState<string>(initialAsOf ?? today)
  const [chip, setChip] = useState<'All' | AccountKind>('All')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter((r) => {
        if (r.lastActivity && r.lastActivity > asOf) return false
        if (chip !== 'All' && classifyKind(r.path) !== chip) return false
        if (q && !r.path.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        const da = a.lastActivity ?? ''
        const db = b.lastActivity ?? ''
        if (da === db) return a.path.localeCompare(b.path)
        return db.localeCompare(da)
      })
  }, [rows, asOf, chip, query])

  const totalCount = useMemo(
    () => rows.filter((r) => !r.lastActivity || r.lastActivity <= asOf).length,
    [rows, asOf],
  )

  return (
    <div className="flex h-screen overflow-hidden bg-white pb-[28px]">
      <NavRail />

      <main className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Context row */}
        <div className="h-[32px] bg-white px-6 flex items-center border-b border-slate-50 flex-shrink-0">
          <span className="font-mono text-[11px] text-slate-800 font-bold">Accounts</span>
        </div>

        {/* Page header */}
        <div className="px-6 py-6 border-b border-slate-100 flex-shrink-0">
          <h1 className="text-3xl font-bold text-[#191c1e] tracking-tight mb-1">Accounts</h1>
          <p className="text-sm text-slate-500">{totalCount} accounts</p>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 flex items-center justify-between bg-slate-50/50 flex-shrink-0">
          <div className="relative w-[600px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
              search
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-[13px] bg-white border border-slate-200 rounded-md focus:border-teal-600/50 focus:ring-0 placeholder:text-slate-400 outline-none"
              placeholder="Search accounts..."
              type="text"
            />
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-[12px] text-slate-500">As of</span>
            <label className="relative flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-md shadow-sm hover:border-slate-300 transition-colors cursor-pointer">
              <span className="material-symbols-outlined text-[16px] text-slate-400">
                calendar_today
              </span>
              <span className="font-mono text-[12px] text-slate-700 tabular-nums">{asOf}</span>
              <span className="material-symbols-outlined text-[18px] text-slate-400">
                arrow_drop_down
              </span>
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value || today)}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label="As of date"
              />
            </label>
          </div>
        </div>

        {/* Chip row */}
        <div className="px-6 h-[44px] bg-[#f2f4f6] flex items-center gap-[8px] border-b border-slate-200 flex-shrink-0">
          {CHIPS.map((c) => {
            const active = chip === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => setChip(c)}
                className={`px-3 py-1 rounded-full text-[11px] font-mono shadow-sm border transition-colors ${
                  active
                    ? 'bg-[#00685f] text-white border-[#00685f]'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {c}
              </button>
            )
          })}
        </div>

        {/* Table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center px-6 h-[32px] bg-white border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-400 font-mono font-bold sticky top-0 z-10 flex-shrink-0 whitespace-nowrap">
            <div className="flex-1 pr-4">Account</div>
            <div className="w-[120px] text-right ml-4">Last Activity</div>
            <div className="w-[60px] text-right ml-4">CCY</div>
            <div className="w-[140px] text-right ml-2">Balance</div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.map((row, idx) => {
              const isRecent =
                recentPath != null &&
                row.path === recentPath &&
                row.currency === rows.find((r) => r.path === recentPath)?.currency
              const negative = row.balance < 0
              return (
                <div
                  key={`${row.path}|${row.currency}|${idx}`}
                  className="flex items-center px-6 h-[40px] border-b border-slate-100 hover:bg-slate-50 group cursor-pointer relative"
                >
                  {isRecent && (
                    <span className="absolute left-2 w-1.5 h-1.5 rounded-full bg-teal-500" />
                  )}
                  <div className="flex-1 pr-4 font-mono text-[12px] truncate">
                    <AccountPath path={row.path} />
                  </div>
                  <div className="w-[120px] font-mono text-[12px] text-slate-600 text-right tabular-nums ml-4">
                    {row.lastActivity ?? '—'}
                  </div>
                  <div className="w-[60px] font-mono text-[11px] text-slate-500 text-right tabular-nums ml-4">
                    {row.currency}
                  </div>
                  <div
                    className={`w-[140px] font-mono text-[13px] text-right tabular-nums ml-2 ${
                      negative ? 'text-rose-600' : 'text-slate-900'
                    }`}
                  >
                    {formatBalance(row.balance, row.currency)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {/* Right AI sidebar */}
      <aside className="w-[320px] bg-slate-50 border-l border-slate-200 flex flex-col overflow-hidden pb-7">
        <div className="px-4 py-4 flex items-center space-x-2">
          <span className="material-symbols-outlined text-[16px] text-[#00685f]">
            auto_awesome
          </span>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-900">
            AI Manuscript Assistant
          </h2>
        </div>
        <div className="flex-1 flex flex-col justify-center px-6 text-center">
          <div className="mb-6">
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Ask AI about your account structure...
            </p>
            <div className="flex flex-col space-y-2">
              <button className="text-[11px] py-1.5 px-3 bg-white border border-slate-200 rounded text-slate-600 hover:border-[#00685f] transition-colors text-left flex items-center">
                <span className="material-symbols-outlined text-[14px] mr-2 text-slate-300">
                  analytics
                </span>
                "Summarize my coffee spending"
              </button>
              <button className="text-[11px] py-1.5 px-3 bg-white border border-slate-200 rounded text-slate-600 hover:border-[#00685f] transition-colors text-left flex items-center">
                <span className="material-symbols-outlined text-[14px] mr-2 text-slate-300">
                  auto_fix
                </span>
                "Clean up payee names in this month"
              </button>
              <button className="text-[11px] py-1.5 px-3 bg-white border border-slate-200 rounded text-slate-600 hover:border-[#00685f] transition-colors text-left flex items-center">
                <span className="material-symbols-outlined text-[14px] mr-2 text-slate-300">
                  balance
                </span>
                "Find unbalanced transactions"
              </button>
            </div>
          </div>
        </div>
        <div className="p-4 bg-white border-t border-slate-200">
          <div className="relative bg-slate-50 rounded border border-slate-200 focus-within:border-[#00685f]/50 transition-colors">
            <textarea
              className="w-full bg-transparent border-none rounded p-3 h-24 resize-none text-[13px] text-slate-700 placeholder:text-slate-400 focus:ring-0 outline-none"
              placeholder="Ask AI about this ledger..."
            />
            <div className="absolute bottom-2 right-2 flex items-center space-x-1">
              <button className="p-1.5 text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-[20px]">mic</span>
              </button>
              <button className="p-1.5 text-[#00685f]">
                <span
                  className="material-symbols-outlined text-[20px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  send
                </span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Status bar */}
      <footer className="fixed bottom-0 left-[48px] right-0 h-[28px] z-40 bg-[#f2f4f6] border-t border-slate-200 flex items-center justify-between px-4 font-mono text-[10px] uppercase tracking-wider text-slate-500">
        <div className="flex items-center space-x-6">
          <span>{totalCount} accounts</span>
          <span className="text-[#00685f] font-bold flex items-center space-x-1">
            <span className="material-symbols-outlined text-[12px]">check_circle</span>
            <span>Parsed</span>
          </span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-[#00685f]" />
            <span>Ready</span>
          </span>
          <span>Beancount v2.3.5</span>
        </div>
      </footer>
    </div>
  )
}
