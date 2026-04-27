'use client'

import { useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { LRLanguage, LanguageSupport, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { styleTags, tags as t } from '@lezer/highlight'
import { parser as beancountParser } from 'lezer-beancount'
import type {
  Entry,
  EntryBalance,
  EntryClose,
  EntryDocument,
  EntryNote,
  EntryOpen,
  EntryPad,
  EntryTxn,
  Posting,
} from '@/durable/ledger-types'
import { splitCamel } from '@/lib/beancount/account-display'
import { useAccountEntries } from '../home/use-account-entries'

const TOP_LEVELS = new Set(['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses'])

const beancountLang = LRLanguage.define({
  parser: beancountParser.configure({
    props: [
      styleTags({
        Date: t.literal,
        TxnFlag: t.operator,
        String: t.string,
        Account: t.variableName,
        Number: t.number,
        Currency: t.unit,
      }),
    ],
  }),
})

const SOURCE_HIGHLIGHT = HighlightStyle.define([
  { tag: t.literal, color: '#0d9488' },
  { tag: t.operator, color: '#334155' },
  { tag: t.string, color: '#334155' },
  { tag: t.variableName, color: '#334155' },
  { tag: t.number, color: '#0f172a', fontWeight: '700' },
  { tag: t.unit, color: '#64748b' },
])

const SOURCE_THEME = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    fontSize: '12.5px',
    fontFamily: "'JetBrains Mono', monospace",
  },
  '.cm-content': {
    padding: '0',
    lineHeight: '1.6',
    fontFamily: "'JetBrains Mono', monospace",
    caretColor: '#0d9488',
  },
  '.cm-line': { padding: '0' },
  '.cm-gutters': { display: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-focused': { outline: 'none' },
})

const SOURCE_EXTENSIONS = [new LanguageSupport(beancountLang), syntaxHighlighting(SOURCE_HIGHLIGHT)]

const GRID_STYLE = { gridTemplateColumns: '24px 100px 1fr 120px 120px 140px' } as const

const EDITOR_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
  highlightSelectionMatches: false,
} as const

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit' })
const amountFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const currencySymbols: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥' }
function currencyPrefix(code: string | null): string {
  if (!code) return ''
  return currencySymbols[code] ?? ''
}

function formatRowDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return dateFmt.format(new Date(Date.UTC(y, m - 1, d)))
}

function postingForAccount(txn: EntryTxn, account: string): Posting | null {
  return txn.postings.find((p) => p.account === account) ?? null
}

function postingAmountNumber(p: Posting | null): number {
  if (!p || p.amount == null) return 0
  const n = parseFloat(p.amount)
  return Number.isFinite(n) ? n : 0
}

type TxnRow = {
  kind: 'txn'
  entry: EntryTxn
  amount: number
  currency: string | null
  balance: number
}

type RenderRow =
  | TxnRow
  | { kind: 'open'; entry: EntryOpen }
  | { kind: 'close'; entry: EntryClose }
  | { kind: 'balance'; entry: EntryBalance }
  | { kind: 'pad'; entry: EntryPad }
  | { kind: 'note'; entry: EntryNote }
  | { kind: 'document'; entry: EntryDocument }

type LedgerSummary = {
  rows: RenderRow[]
  dominantCurrency: string | null
  finalBalance: number
}

function buildLedgerRows(entries: Entry[], account: string): LedgerSummary {
  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.kind.localeCompare(b.kind)
  })
  const counts = new Map<string, number>()
  let bal = 0
  const out: RenderRow[] = []
  for (const e of sorted) {
    if (e.kind === 'txn') {
      const post = postingForAccount(e, account)
      const amt = postingAmountNumber(post)
      bal += amt
      if (post?.currency) counts.set(post.currency, (counts.get(post.currency) ?? 0) + 1)
      out.push({ kind: 'txn', entry: e, amount: amt, currency: post?.currency ?? null, balance: bal })
    } else {
      out.push({ kind: e.kind, entry: e } as RenderRow)
    }
  }
  let dominantCurrency: string | null = null
  let max = 0
  for (const [c, n] of counts) if (n > max) { dominantCurrency = c; max = n }
  for (const row of out) {
    if (row.kind === 'txn' && !row.currency) row.currency = dominantCurrency
  }
  return { rows: out.reverse(), dominantCurrency, finalBalance: bal }
}

function accountTitle(path: string): string {
  const parts = path.split(':').filter(Boolean)
  if (parts.length === 0) return path
  const rest = TOP_LEVELS.has(parts[0]) ? parts.slice(1) : parts
  const tail = rest.length >= 2 ? rest.slice(-2) : rest
  return tail.map(splitCamel).join(' ')
}

function breadcrumbSegments(path: string): string[] {
  return path.split(':').filter(Boolean)
}

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function directiveSummary(row: Exclude<RenderRow, TxnRow>): { label: string; detail: string } {
  switch (row.kind) {
    case 'open':
      return {
        label: 'Open',
        detail: row.entry.constraint_currencies.length > 0
          ? `Currencies: ${row.entry.constraint_currencies.join(', ')}`
          : '',
      }
    case 'close':
      return { label: 'Close', detail: '' }
    case 'balance':
      return { label: 'Balance', detail: `${row.entry.amount} ${row.entry.currency}` }
    case 'pad':
      return { label: 'Pad', detail: `from ${row.entry.account_pad}` }
    case 'note':
      return { label: 'Note', detail: row.entry.description }
    case 'document':
      return { label: 'Document', detail: row.entry.filename }
  }
}

export function PerAccountView({ account }: { account: string }) {
  const entriesQuery = useAccountEntries(account)
  const ledger = useMemo<LedgerSummary>(
    () =>
      entriesQuery.data
        ? buildLedgerRows(entriesQuery.data.entries, account)
        : { rows: [], dominantCurrency: null, finalBalance: 0 },
    [entriesQuery.data, account],
  )

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sourceEdits, setSourceEdits] = useState<Record<string, string>>({})

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const title = accountTitle(account)
  const segments = breadcrumbSegments(account)
  const balancePrefix = currencyPrefix(ledger.dominantCurrency)
  const balanceText =
    ledger.rows.length > 0
      ? `${ledger.finalBalance < 0 ? '-' : ''}${balancePrefix}${amountFmt.format(Math.abs(ledger.finalBalance))}`
      : '—'

  return (
    <div className="w-full h-screen flex bg-slate-50 font-sans text-black">
      <nav className="bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-6 w-[64px] shrink-0">
        <div className="w-8 h-8 bg-teal-500 flex items-center justify-center rounded-md text-white font-black text-lg">M</div>
        <div className="flex flex-col gap-4">
          <button className="p-2 text-slate-400 hover:text-teal-500 transition-colors">
            <Icon name="dashboard" />
          </button>
          <button className="p-2 text-slate-400 hover:text-teal-500 transition-colors">
            <Icon name="analytics" />
          </button>
          <button className="p-2 text-slate-400 hover:text-teal-500 transition-colors">
            <Icon name="lightbulb" />
          </button>
          <button className="p-2 bg-teal-50 text-teal-600 border-r-2 border-teal-500">
            <Icon name="account_balance" />
          </button>
        </div>
        <div className="mt-auto flex flex-col items-center pb-2">
          <div className="w-7 h-7 rounded-full bg-slate-900 flex items-center justify-center text-white text-[12px] font-bold">f</div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col min-w-0">
        <div className="h-[56px] bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="text-[13px] flex items-center gap-2">
              <span className="text-slate-500">Ledger</span>
              {segments.slice(0, -1).map((seg, i) => (
                <span key={`${seg}-${i}`} className="flex items-center gap-2">
                  <span className="text-slate-300">/</span>
                  <span className="text-slate-500">{seg}</span>
                </span>
              ))}
              {segments.length > 0 && (
                <>
                  <span className="text-slate-300">/</span>
                  <span className="text-slate-700">{segments[segments.length - 1]}</span>
                </>
              )}
            </div>
            <button className="flex items-center gap-1 bg-white border border-slate-200 rounded h-[32px] px-3 text-[13px] font-medium text-slate-900 hover:bg-slate-50">
              {title}
              <Icon name="expand_more" className="!text-[16px] text-slate-500" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-1.5 hover:bg-slate-100 rounded text-slate-500">
              <Icon name="search" className="!text-[20px]" />
            </button>
            <button className="p-1.5 hover:bg-slate-100 rounded text-slate-500">
              <Icon name="settings" className="!text-[20px]" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="font-bold text-[18px] text-slate-900 leading-none">{title}</h1>
              <div className="font-mono text-[12px] text-slate-400 leading-none">{account}</div>
            </div>
            <div className="font-mono font-bold text-[28px] text-slate-900 leading-none">{balanceText}</div>
          </div>
        </div>

        <div className="h-[40px] bg-teal-50 border border-slate-200 px-6 flex items-center justify-between shrink-0 text-teal-700">
          <div className="text-[12px] text-slate-500">
            {Object.keys(sourceEdits).length > 0 ? 'Unsaved changes' : 'No unsaved changes'}
          </div>
          <div className="flex items-center gap-3">
            <button className="border border-slate-300 bg-white text-slate-700 text-[13px] font-medium hover:bg-slate-50 px-3 py-1 rounded-sm shadow-sm">Revert</button>
            <button className="bg-teal-600 hover:bg-teal-700 text-white text-[13px] font-medium px-3 py-1 rounded-sm shadow-sm flex items-center gap-1">
              <span>Save</span>
              <span className="text-[11px] bg-teal-700 px-1.5 py-0.5 rounded-sm ml-1.5">⌘S</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-white">
          <div className="min-w-[800px]">
            <div
              className="grid px-6 py-2 bg-slate-50/50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-widest text-slate-500"
              style={GRID_STYLE}
            >
              <div />
              <div>DATE</div>
              <div>PAYEE · NARRATION</div>
              <div className="text-right">DEBIT</div>
              <div className="text-right">CREDIT</div>
              <div className="text-right">BALANCE</div>
            </div>

            {entriesQuery.status === 'loading' && (
              <div className="px-6 py-6 text-[12px] text-slate-400">Loading entries…</div>
            )}
            {entriesQuery.status === 'error' && (
              <div className="px-6 py-6 text-[12px] text-rose-600">
                Failed to load: {entriesQuery.errorMsg}
              </div>
            )}
            {entriesQuery.status === 'idle' && ledger.rows.length === 0 && (
              <div className="px-6 py-6 text-[12px] text-slate-400">
                No entries for this account.
              </div>
            )}

            {ledger.rows.map((row) => {
              const key = `${row.kind}-${row.entry.id}`
              if (row.kind !== 'txn') {
                const { label, detail } = directiveSummary(row)
                return (
                  <div
                    key={key}
                    className="grid px-6 py-3 items-center border-b border-slate-100 bg-slate-50/40"
                    style={GRID_STYLE}
                  >
                    <div />
                    <div className="font-mono text-[13px] text-slate-400">{formatRowDate(row.entry.date)}</div>
                    <div className="text-[13px] truncate col-span-4 grid grid-cols-[auto_1fr] gap-2 items-center">
                      <span className="text-[10px] uppercase tracking-widest font-bold text-teal-600 px-1.5 py-0.5 bg-teal-50 rounded-sm">
                        {label}
                      </span>
                      <span className="text-slate-600 truncate">{detail}</span>
                    </div>
                  </div>
                )
              }
              const isExpanded = expanded.has(key)
              const debit = row.amount > 0 ? amountFmt.format(row.amount) : null
              const credit = row.amount < 0 ? amountFmt.format(-row.amount) : null
              const balanceStr = `${row.balance < 0 ? '-' : ''}${amountFmt.format(Math.abs(row.balance))}`
              const payee = row.entry.payee || row.entry.narration || row.entry.flag || '—'
              const narration = row.entry.payee ? row.entry.narration : ''
              const sourceText = sourceEdits[key] ?? ''
              return (
                <div key={key} className={isExpanded ? 'bg-white border-b border-slate-100 shadow-sm' : ''}>
                  <div
                    className={`grid px-6 py-3 items-center cursor-pointer group hover:bg-slate-50 ${
                      isExpanded ? '' : 'border-b border-slate-100'
                    }`}
                    style={GRID_STYLE}
                    onClick={() => toggle(key)}
                  >
                    <div className={`leading-none ${isExpanded ? 'text-teal-500' : 'text-slate-400 group-hover:text-slate-600'}`}>
                      <Icon
                        name={isExpanded ? 'expand_more' : 'chevron_right'}
                        className={`!text-[18px] ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    </div>
                    <div className="font-mono text-[13px] text-slate-400">{formatRowDate(row.entry.date)}</div>
                    <div className="text-[13px] truncate">
                      <span className="font-bold text-slate-800">{payee}</span>
                      {narration && <span className="text-slate-500">{' · '}{narration}</span>}
                    </div>
                    <div className={`font-mono text-[13px] text-right ${debit ? 'text-slate-900' : 'text-slate-400'}`}>
                      {debit ?? '—'}
                    </div>
                    <div className={`font-mono text-[13px] text-right ${credit ? 'text-teal-600' : 'text-slate-400'}`}>
                      {credit ?? '—'}
                    </div>
                    <div className="font-mono text-[13px] text-right text-slate-600">{balanceStr}</div>
                  </div>

                  {isExpanded && (
                    <div className="ml-[56px] mr-6 mb-4 bg-slate-50 border border-slate-200 rounded-sm p-5">
                      <CodeMirror
                        value={sourceText}
                        onChange={(v) => setSourceEdits((prev) => ({ ...prev, [key]: v }))}
                        theme={SOURCE_THEME}
                        basicSetup={EDITOR_SETUP}
                        extensions={SOURCE_EXTENSIONS}
                      />
                    </div>
                  )}
                </div>
              )
            })}

            {entriesQuery.data && entriesQuery.data.total > ledger.rows.length && (
              <div className="py-6 flex justify-center text-slate-400 font-mono text-[11px]">
                ↓ {entriesQuery.data.total - ledger.rows.length} more
              </div>
            )}
          </div>
        </div>
      </main>

      <aside className="w-[360px] bg-slate-50 border-l border-slate-200 flex flex-col shrink-0">
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="w-[80%] h-[120px] border-2 border-dashed border-slate-300 rounded mx-auto flex items-center justify-center text-slate-300 text-[13px]">
            AI assistant coming soon
          </div>
        </div>
        <div className="p-4 bg-white border-t border-slate-200">
          <div className="flex items-end bg-white border border-slate-200 rounded p-2 focus-within:ring-1 focus-within:ring-teal-500 focus-within:border-teal-500">
            <textarea
              className="w-full bg-transparent border-none focus:ring-0 focus:outline-none resize-none text-[13px] text-slate-700 placeholder-slate-400 p-1"
              placeholder="Ask AI about this ledger..."
              rows={1}
            />
            <div className="flex items-center gap-1 ml-2 shrink-0">
              <button className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded leading-none">
                <Icon name="mic" className="!text-[18px]" />
              </button>
              <button className="p-1.5 text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded leading-none">
                <Icon name="send" className="!text-[18px]" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
