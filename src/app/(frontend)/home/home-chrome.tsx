'use client'

import React, { useMemo, useState } from 'react'
import type { Posting, TransactionV2 } from '@/durable/ledger-v2-types'
import { splitCamel } from '@/lib/beancount/account-display'
import { useAccounts } from './use-accounts'
import { useAccountTransactions } from './use-account-transactions'

const TOP_LEVELS = ['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses'] as const
type TopLevel = (typeof TOP_LEVELS)[number]
type GroupKey = TopLevel | 'Other'

const EMPTY_ACCOUNTS: readonly string[] = []

const amountFmt = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const currencyFmtCache = new Map<string, Intl.NumberFormat>()
function currencyFmt(currency: string): Intl.NumberFormat {
  let f = currencyFmtCache.get(currency)
  if (!f) {
    f = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    currencyFmtCache.set(currency, f)
  }
  return f
}

function topLevelOf(path: string): GroupKey {
  const head = path.split(':')[0]
  return (TOP_LEVELS as readonly string[]).includes(head) ? (head as TopLevel) : 'Other'
}

function displayAccountName(path: string): string {
  const parts = path.split(':').filter(Boolean)
  if (parts.length === 0) return path
  const rest = (TOP_LEVELS as readonly string[]).includes(parts[0]) ? parts.slice(1) : parts
  const tail = rest.length >= 2 ? rest.slice(-2) : rest
  return tail.map(splitCamel).join(' ')
}

function categoryChip(path: string): string | null {
  const parts = path.split(':').filter(Boolean)
  if (parts.length < 2) return null
  if (parts[0] === 'Liabilities' && parts[1] === 'CreditCard') return 'Credit Card'
  return splitCamel(parts[1])
}

type LedgerRow = {
  txn: TransactionV2
  amount: number
  currency: string | null
  balance: number
}

type LedgerSummary = {
  rows: LedgerRow[]
  dominantCurrency: string | null
}

function postingForAccount(txn: TransactionV2, account: string): Posting | null {
  return txn.postings.find((p) => p.account === account) ?? null
}

function postingAmountNumber(p: Posting | null): number {
  if (!p || p.amount == null) return 0
  const n = parseFloat(p.amount)
  return Number.isFinite(n) ? n : 0
}

function buildLedgerRows(txns: TransactionV2[], account: string): LedgerSummary {
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date))
  const counts = new Map<string, number>()
  let bal = 0
  const out: LedgerRow[] = []
  for (const txn of sorted) {
    const post = postingForAccount(txn, account)
    const amt = postingAmountNumber(post)
    bal += amt
    if (post?.currency) counts.set(post.currency, (counts.get(post.currency) ?? 0) + 1)
    out.push({ txn, amount: amt, currency: post?.currency ?? null, balance: bal })
  }
  let dominantCurrency: string | null = null
  let max = 0
  for (const [c, n] of counts) if (n > max) { dominantCurrency = c; max = n }
  for (const row of out) if (!row.currency) row.currency = dominantCurrency
  return { rows: out.reverse(), dominantCurrency }
}

export function HomeChrome() {
  const accountsQuery = useAccounts()
  const accountsData = accountsQuery.data
  const [paneOpen, setPaneOpen] = useState(false)
  const [accountOverride, setAccountOverride] = useState<string | null>(null)
  const [txnOverride, setTxnOverride] = useState<number | null>(null)
  const [openGroups, setOpenGroups] = useState<Set<GroupKey>>(
    () => new Set<GroupKey>(['Liabilities', 'Assets']),
  )
  const [filter, setFilter] = useState('')

  const accounts = accountsData?.accounts ?? EMPTY_ACCOUNTS
  const selectedAccount =
    accountOverride && accounts.includes(accountOverride)
      ? accountOverride
      : (accounts[0] ?? null)

  const txnsQuery = useAccountTransactions(selectedAccount)
  const txnsData = txnsQuery.data
  const txnTotal = txnsData?.total ?? 0

  const ledger = useMemo<LedgerSummary>(
    () =>
      selectedAccount && txnsData
        ? buildLedgerRows(txnsData.rows, selectedAccount)
        : { rows: [], dominantCurrency: null },
    [txnsData, selectedAccount],
  )

  const groups = useMemo(() => {
    const m = new Map<GroupKey, string[]>()
    const q = filter.trim().toLowerCase()
    const list = accountsData?.accounts ?? EMPTY_ACCOUNTS
    for (const a of list) {
      if (q && !a.toLowerCase().includes(q) && !displayAccountName(a).toLowerCase().includes(q)) {
        continue
      }
      const k = topLevelOf(a)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(a)
    }
    return m
  }, [accountsData, filter])

  const selectedTxnId =
    txnOverride && ledger.rows.some((r) => r.txn.id === txnOverride)
      ? txnOverride
      : (ledger.rows[0]?.txn.id ?? null)
  const selectedRow = ledger.rows.find((r) => r.txn.id === selectedTxnId) ?? null
  const currentBalance = ledger.rows[0]?.balance ?? 0
  const lastActivity = ledger.rows[0]?.txn.date ?? null

  const accountChip = selectedAccount ? categoryChip(selectedAccount) : null
  const accountTitle = selectedAccount ? displayAccountName(selectedAccount) : null

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
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full bg-white border border-[#E2E8F0] text-[11px] pl-8 py-1.5 rounded-[6px] focus:ring-0 focus:border-teal-500"
                placeholder="Filter accounts..."
                type="text"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {accountsQuery.status === 'loading' && (
              <div className="px-4 py-2 text-[11px] text-slate-400">Loading accounts…</div>
            )}
            {accountsQuery.status === 'error' && (
              <div className="px-4 py-2 text-[11px] text-rose-600">
                Failed to load: {accountsQuery.errorMsg}
              </div>
            )}
            {accountsQuery.status === 'idle' && accounts.length === 0 && (
              <div className="px-4 py-2 text-[11px] text-slate-400">No accounts yet.</div>
            )}
            {Array.from(groups.entries()).map(([group, accs]) => {
              const isOpen = openGroups.has(group)
              return (
                <React.Fragment key={group}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenGroups((prev) => {
                        const next = new Set(prev)
                        if (next.has(group)) next.delete(group)
                        else next.add(group)
                        return next
                      })
                    }}
                    className="w-full px-4 py-2 flex items-center gap-1 cursor-pointer hover:bg-slate-100 transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-[14px] text-slate-400">
                      {isOpen ? 'arrow_drop_down' : 'arrow_right'}
                    </span>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {group}
                    </div>
                    <div className="ml-auto text-[10px] text-slate-400 font-mono">{accs.length}</div>
                  </button>
                  {isOpen &&
                    accs.map((acc) => {
                      const active = acc === selectedAccount
                      return (
                        <button
                          key={acc}
                          type="button"
                          onClick={() => {
                            setAccountOverride(acc)
                            setTxnOverride(null)
                          }}
                          className={
                            active
                              ? 'w-full pl-8 pr-4 py-2 bg-teal-50 text-teal-900 border-r-4 border-teal-500 cursor-pointer flex justify-between items-center text-left'
                              : 'w-full pl-8 pr-4 py-2 hover:bg-[#F2F3FF] transition-colors cursor-pointer flex justify-between items-center text-left'
                          }
                          title={acc}
                        >
                          <span className="text-[12px] font-medium text-slate-700 truncate">
                            {displayAccountName(acc)}
                          </span>
                        </button>
                      )
                    })}
                </React.Fragment>
              )
            })}
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-slate-50 border-b border-slate-200 flex justify-between items-center w-full px-4 h-8 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-['Inter'] font-black text-slate-900 text-[10px] uppercase tracking-widest">
              MilesVault
            </span>
            <span className="text-slate-300 text-[10px]">|</span>
            <span className="text-[11px] font-medium text-slate-500 truncate">
              {accountTitle ? `Accounts → ${accountTitle}` : 'Accounts'}
            </span>
          </div>
          <div className="flex items-center gap-4">
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

        <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          <div className="bg-white p-6 border border-[#E2E8F0] rounded-[6px] shadow-sm">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 truncate">
                {selectedAccount ?? '—'}
              </div>
              <div className="flex gap-2 mb-4">
                {accountChip && (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-bold rounded-[6px] uppercase tracking-wider">
                    {accountChip}
                  </span>
                )}
                {ledger.dominantCurrency && (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-bold rounded-[6px] uppercase tracking-wider">
                    {ledger.dominantCurrency}
                  </span>
                )}
              </div>
            </div>
            <div className="border-t border-[#E2E8F0] pt-3 mt-3 grid grid-cols-3 gap-4">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Current Balance
                </div>
                <div className="data-mono text-[14px] font-bold text-slate-900">
                  {ledger.dominantCurrency
                    ? currencyFmt(ledger.dominantCurrency).format(currentBalance)
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Transactions
                </div>
                <div className="data-mono text-[14px] font-bold text-slate-900">{txnTotal}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Last Activity
                </div>
                <div className="data-mono text-[14px] font-bold text-slate-900">
                  {lastActivity ?? '—'}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-[6px] overflow-hidden">
            <div className="grid grid-cols-[100px_1fr_120px_120px_120px] bg-[#F4F6F8] border-b border-[#E2E8F0] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <div>Date</div>
              <div>Payee · Narration</div>
              <div className="text-right">Debit</div>
              <div className="text-right">Credit</div>
              <div className="text-right">Balance</div>
            </div>
            {txnsQuery.status === 'loading' && (
              <div className="px-4 py-6 text-[12px] text-slate-400">Loading transactions…</div>
            )}
            {txnsQuery.status === 'error' && (
              <div className="px-4 py-6 text-[12px] text-rose-600">
                Failed to load: {txnsQuery.errorMsg}
              </div>
            )}
            {txnsQuery.status === 'idle' && ledger.rows.length === 0 && (
              <div className="px-4 py-6 text-[12px] text-slate-400">
                No transactions for this account.
              </div>
            )}
            {ledger.rows.map((row) => (
              <LedgerRowView
                key={row.txn.id}
                row={row}
                active={row.txn.id === selectedTxnId}
                onSelect={() => setTxnOverride(row.txn.id)}
              />
            ))}
          </div>
        </main>
      </div>

      <aside className="w-[360px] bg-slate-50 border-l border-[#E2E8F0] flex flex-col shrink-0">
        <div className="p-4 border-b border-[#E2E8F0] flex items-center gap-3">
          <div className="w-8 h-8 rounded-[6px] bg-teal-100 flex items-center justify-center text-teal-600">
            <span className="material-symbols-outlined">receipt</span>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-slate-400 uppercase">
              {selectedRow ? selectedRow.txn.date : '—'}
            </div>
            <div className="text-[13px] font-bold text-slate-900 truncate">
              {selectedRow?.txn.payee || selectedRow?.txn.narration || '—'}
            </div>
          </div>
        </div>
        <div className="p-6 flex flex-col gap-6 overflow-y-auto">
          {selectedRow && (
            <div className="bg-white p-4 border border-[#E2E8F0] rounded-[6px] shadow-sm">
              <div className="text-[11px] font-bold uppercase text-teal-600 mb-3 tracking-widest">
                Postings
              </div>
              <div className="flex flex-col gap-2">
                {selectedRow.txn.postings.map((p, i) => {
                  const amt = postingAmountNumber(p)
                  return (
                    <div key={i} className="flex justify-between items-baseline gap-3">
                      <span className="text-[11px] text-slate-700 truncate" title={p.account}>
                        {p.account}
                      </span>
                      <span className="data-mono text-[11px] text-slate-500 shrink-0">
                        {p.amount != null
                          ? `${amountFmt.format(amt)} ${p.currency ?? ''}`.trim()
                          : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function LedgerRowView({
  row,
  active,
  onSelect,
}: {
  row: LedgerRow
  active: boolean
  onSelect: () => void
}) {
  const debit = row.amount > 0 ? row.amount : null
  const credit = row.amount < 0 ? -row.amount : null
  const { payee, narration } = row.txn
  const label = payee && narration ? `${payee} · ${narration}` : (narration || payee || '—')
  const cells = (
    <>
      <div className={`data-mono text-[12px] ${active ? 'font-bold text-teal-600' : 'text-slate-500'}`}>
        {row.txn.date}
      </div>
      <div
        className={`text-[12.5px] truncate ${active ? 'font-bold text-slate-900' : 'font-medium text-slate-900'}`}
      >
        {label}
      </div>
      <div
        className={`data-mono text-[12px] text-right ${active ? 'font-bold text-slate-900' : 'text-slate-900'}`}
      >
        {debit != null ? amountFmt.format(debit) : '—'}
      </div>
      <div className="data-mono text-[12px] text-right text-teal-600">
        {credit != null ? amountFmt.format(credit) : '—'}
      </div>
      <div className="data-mono text-[12px] text-right text-slate-600">
        {amountFmt.format(row.balance)}
      </div>
    </>
  )
  if (active) {
    return (
      <div className="bg-teal-50 border-l-4 border-teal-500">
        <button
          type="button"
          onClick={onSelect}
          className="w-full grid grid-cols-[100px_1fr_120px_120px_120px] px-4 py-3 items-center text-left"
        >
          {cells}
        </button>
        <div className="px-4 pb-4">
          <pre className="bg-slate-950 p-3 rounded-[6px] font-mono text-[11px] text-teal-400 leading-relaxed whitespace-pre overflow-x-auto">
            {row.txn.raw_text}
          </pre>
        </div>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full grid grid-cols-[100px_1fr_120px_120px_120px] px-4 py-3 border-b border-[#E2E8F0] hover:bg-[#F2F3FF] transition-colors items-center text-left"
    >
      {cells}
    </button>
  )
}
