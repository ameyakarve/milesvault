'use client'

import Link from 'next/link'
import React, { useEffect, useMemo, useState } from 'react'
import type { AccountSummaryRow } from '@/durable/ledger-types'
import {
  MagnifyingGlass,
  Sparkle,
  ChartBar,
  MagicWand,
  Scales,
  Microphone,
  PaperPlaneTilt,
} from '@phosphor-icons/react/dist/ssr'
import { KumoStatusBar } from '../_chrome/kumo-status-bar'

type AccountKind = 'Assets' | 'Liabilities' | 'Equity' | 'Income' | 'Expenses'

type AccountRow = {
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

function dateFromInt(n: number): string {
  const s = String(n).padStart(8, '0')
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

function balanceFromScaled(balanceScaled: string, scale: number): number {
  const negative = balanceScaled.startsWith('-')
  const raw = negative ? balanceScaled.slice(1) : balanceScaled
  const padded = raw.padStart(scale + 1, '0')
  const intPart = padded.slice(0, padded.length - scale) || '0'
  const fracPart = padded.slice(padded.length - scale)
  const numeric = Number(`${intPart}.${fracPart}`)
  return negative ? -numeric : numeric
}

function isHidden(path: string): boolean {
  return path === 'Equity:Void' || path.startsWith('Equity:Void:')
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

export function KumoAccountsDirectory({ initialAsOf }: { initialAsOf: string }) {
  const [rows, setRows] = useState<AccountRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chip, setChip] = useState<'All' | AccountKind>('All')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/ledger/accounts?as_of=${encodeURIComponent(initialAsOf)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`accounts: ${r.status}`)
        return r.json() as Promise<{ rows: AccountSummaryRow[] }>
      })
      .then((data) => {
        if (cancelled) return
        setRows(
          data.rows.map((r) => ({
            path: r.account,
            currency: r.currency,
            balance: balanceFromScaled(r.balance_scaled, r.scale),
            lastActivity: r.last_activity ? dateFromInt(r.last_activity) : null,
          })),
        )
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [initialAsOf])

  const visible = useMemo(() => (rows ?? []).filter((r) => !isHidden(r.path)), [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return visible
      .filter((r) => {
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
  }, [visible, chip, query])

  const totalCount = visible.length

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-rose-600">
        Failed to load accounts: {error}
      </div>
    )
  }

  return (
    <>
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
        <div className="px-6 py-3 flex items-center bg-slate-50/50 flex-shrink-0">
          <div className="flex w-full items-center bg-white border border-slate-200 rounded-md focus-within:border-teal-600/50 transition-colors">
            <span className="pl-3 pr-2 text-slate-400 flex-shrink-0">
              <MagnifyingGlass size={16} weight="regular" />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent py-1.5 pr-3 text-[13px] placeholder:text-slate-400 outline-none border-0 focus:ring-0"
              placeholder="Search accounts..."
              type="text"
            />
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
            {rows == null ? (
              <div className="p-6 text-xs text-slate-400">Loading…</div>
            ) : (
              filtered.map((row, idx) => {
                const negative = row.balance < 0
                const href = `/kumo/ledger/${row.path
                  .split(':')
                  .map(encodeURIComponent)
                  .join('/')}?ccy=${encodeURIComponent(row.currency)}`
                return (
                  <Link
                    key={`${row.path}|${row.currency}|${idx}`}
                    href={href}
                    className="flex items-center px-6 h-[40px] border-b border-slate-100 hover:bg-slate-50 group cursor-pointer relative"
                  >
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
                  </Link>
                )
              })
            )}
          </div>
        </div>
      </main>

      {/* Right AI sidebar */}
      <aside className="w-[320px] bg-slate-50 border-l border-slate-200 flex flex-col overflow-hidden pb-7">
        <div className="px-4 py-4 flex items-center space-x-2">
          <Sparkle size={16} className="text-[#00685f]" weight="fill" />
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
                <ChartBar size={14} className="mr-2 text-slate-300" />
                {`"Summarize my coffee spending"`}
              </button>
              <button className="text-[11px] py-1.5 px-3 bg-white border border-slate-200 rounded text-slate-600 hover:border-[#00685f] transition-colors text-left flex items-center">
                <MagicWand size={14} className="mr-2 text-slate-300" />
                {`"Clean up payee names in this month"`}
              </button>
              <button className="text-[11px] py-1.5 px-3 bg-white border border-slate-200 rounded text-slate-600 hover:border-[#00685f] transition-colors text-left flex items-center">
                <Scales size={14} className="mr-2 text-slate-300" />
                {`"Find unbalanced transactions"`}
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
                <Microphone size={20} />
              </button>
              <button className="p-1.5 text-[#00685f]">
                <PaperPlaneTilt size={20} weight="fill" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <KumoStatusBar count={totalCount} />
    </>
  )
}
