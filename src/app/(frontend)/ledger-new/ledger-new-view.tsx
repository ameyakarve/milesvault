'use client'

import { useEffect, useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { diffLines } from 'diff'
import type { Transaction } from '@/durable/ledger-types'
import { splitEntries } from '@/lib/beancount/extract'
import { safeParse } from '../ledger/card-patterns/types'
import { composeBuffer, scandiBeancountExtensions } from './editor'

const PAGE_SIZE = 10

type Snapshot = { id: number; raw_text: string; expected_updated_at: number }

type Entry = {
  text: string
  snapshotId: number | null
}

function buildSnapshots(rows: Transaction[]): Snapshot[] {
  return rows.map((r) => ({
    id: r.id,
    raw_text: r.raw_text.trim(),
    expected_updated_at: r.updated_at,
  }))
}

function deriveEntries(buffer: string, snapshots: Snapshot[]): Entry[] {
  const parts = splitEntries(buffer).map((e) => e.text.trim()).filter((t) => t.length > 0)
  const byBody = new Map<string, Snapshot[]>()
  for (const s of snapshots) {
    const arr = byBody.get(s.raw_text) ?? []
    arr.push(s)
    byBody.set(s.raw_text, arr)
  }
  const used = new Set<number>()
  const out: Entry[] = []
  // First pass: exact body matches
  const resolved: (Snapshot | null)[] = parts.map((text) => {
    const candidates = byBody.get(text) ?? []
    const m = candidates.find((c) => !used.has(c.id))
    if (m) {
      used.add(m.id)
      return m
    }
    return null
  })
  // Second pass: positional fallback for unmatched entries
  const unusedInOrder = snapshots.filter((s) => !used.has(s.id))
  let cursor = 0
  for (let i = 0; i < parts.length; i++) {
    let snap = resolved[i]
    if (!snap && cursor < unusedInOrder.length) {
      snap = unusedInOrder[cursor++]
    }
    out.push({ text: parts[i], snapshotId: snap ? snap.id : null })
  }
  return out
}

type PillKind = 'split' | 'forex' | 'dcc' | 'benefit'

type CardRow = {
  month: string
  day: string
  glyph: string
  payee: string
  narration: string
  account: string
  rewards: { old?: string; current: string }
  amount: string
  state?: 'staged' | 'focused'
  pill?: { label: string; kind: PillKind }
}

const PRESETS: CardRow[] = [
  {
    month: 'OCT',
    day: '24',
    glyph: 'restaurant',
    payee: 'Swiggy',
    narration: '· dinner with r',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { old: '+87', current: '+5,800 pts' },
    amount: '-₹640.00',
    state: 'staged',
  },
  {
    month: 'OCT',
    day: '23',
    glyph: 'shopping_bag',
    payee: 'Zepto',
    narration: '· weekend restock',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+2,480 pts' },
    amount: '-₹320.00',
  },
  {
    month: 'OCT',
    day: '22',
    glyph: 'directions_car',
    payee: 'Uber',
    narration: '· ride to office',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+320 pts' },
    amount: '-₹450.00',
    state: 'focused',
  },
  {
    month: 'OCT',
    day: '21',
    glyph: 'restaurant',
    payee: 'Meat Masterz',
    narration: '· weekend order',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { old: '+164', current: '+328 pts' },
    amount: '-₹1,250.00',
    state: 'staged',
  },
  {
    month: 'OCT',
    day: '20',
    glyph: 'account_balance',
    payee: 'HDFC',
    narration: '· oct statement payment',
    account: 'Assets:Bank:HDFC → Liabilities:CreditCard:Axis',
    rewards: { current: '—' },
    amount: '-₹48,200.00',
  },
  {
    month: 'OCT',
    day: '18',
    glyph: 'inventory_2',
    payee: 'Amazon',
    narration: '· monitor & cables',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { old: '+45', current: '+90 pts' },
    amount: '-₹4,500.00',
    state: 'staged',
    pill: { label: 'split', kind: 'split' },
  },
  {
    month: 'OCT',
    day: '17',
    glyph: 'movie',
    payee: 'Netflix',
    narration: '· premium renewal',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+258 pts' },
    amount: '-₹1,292.00',
    pill: { label: 'forex', kind: 'forex' },
  },
  {
    month: 'OCT',
    day: '16',
    glyph: 'local_activity',
    payee: 'BookMyShow',
    narration: '· dune part two',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+96 pts' },
    amount: '-₹480.00',
  },
  {
    month: 'OCT',
    day: '14',
    glyph: 'restaurant_menu',
    payee: 'EazyDiner',
    narration: '· complimentary visit',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '—' },
    amount: '-₹0.00',
    pill: { label: 'benefit', kind: 'benefit' },
  },
  {
    month: 'OCT',
    day: '12',
    glyph: 'redeem',
    payee: 'Smartbuy',
    narration: '· points → voucher',
    account: 'Assets:Rewards:Axis → Assets:GiftCards:Amazon',
    rewards: { current: '-35,000 pts' },
    amount: '+₹3,500.00',
  },
  {
    month: 'OCT',
    day: '10',
    glyph: 'hotel',
    payee: 'Cleartrip',
    narration: '· delhi hotel',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+1,748 pts' },
    amount: '-₹8,740.00',
    pill: { label: 'dcc', kind: 'dcc' },
  },
  {
    month: 'OCT',
    day: '07',
    glyph: 'payments',
    payee: 'Payroll',
    narration: '· oct salary credit',
    account: 'Income:Salary → Assets:Bank:HDFC',
    rewards: { current: '—' },
    amount: '+₹2,50,000.00',
  },
]

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} aria-hidden>
      {name}
    </span>
  )
}

function Pill({ label }: { kind: PillKind; label: string }) {
  return (
    <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-sm flex items-center gap-1 leading-none shadow-sm ml-auto">
      {label}
    </span>
  )
}

function Card({ row }: { row: CardRow }) {
  const shell =
    row.state === 'staged'
      ? 'bg-sky-50/50 hover:bg-sky-50 border border-sky-100'
      : row.state === 'focused'
        ? 'bg-navy-50/50 border border-navy-200'
        : 'hover:bg-slate-50 border border-transparent'

  const tile =
    row.state === 'staged'
      ? 'border-sky-200'
      : 'border-slate-200'

  const tileHead =
    row.state === 'staged'
      ? 'bg-sky-50 text-sky-700 border-b border-sky-100'
      : 'bg-slate-50 text-slate-500 border-b border-slate-100'

  return (
    <div
      className={`h-[52px] rounded-lg flex items-center px-3 gap-3 relative transition-colors ${shell}`}
    >
      <div
        className={`h-10 w-10 rounded-[6px] border flex flex-col shrink-0 relative bg-white overflow-hidden ${tile}`}
      >
        <div
          className={`h-3 text-[10px] font-medium flex items-center justify-center uppercase leading-none ${tileHead}`}
        >
          {row.month}
        </div>
        <div className="flex-1 text-[18px] text-navy-600 font-semibold flex items-center justify-center leading-none">
          {row.day}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-1">
          <Icon name={row.glyph} className="text-[14px] text-slate-400" />
          <span className="text-navy-600 text-[13px] font-semibold truncate max-w-[16ch] ml-1">
            {row.payee}
          </span>
          <span className="text-slate-400 text-[13px] italic truncate ml-1">
            {row.narration}
          </span>
          {row.pill && <Pill kind={row.pill.kind} label={row.pill.label} />}
        </div>
        <div className="text-[11px] text-slate-400 truncate font-mono">
          {row.account}
        </div>
      </div>
      <div className="w-[92px] text-right shrink-0 font-mono flex flex-col justify-center border-l border-slate-100 pl-2">
        <div className="text-[11px]">
          {row.rewards.old && (
            <>
              <span className="text-slate-300 line-through">{row.rewards.old}</span>{' '}
              <span className="text-slate-300">→</span>{' '}
              <span className="text-sky-600 font-medium">{row.rewards.current}</span>
            </>
          )}
          {!row.rewards.old && (
            <span className="text-slate-600">{row.rewards.current}</span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0 font-mono flex flex-col justify-center w-[112px] ml-2">
        <div
          className={`text-[13px] font-medium ${
            row.amount.startsWith('-') ? 'text-error' : 'text-navy-600'
          }`}
        >
          {row.amount}
        </div>
      </div>
    </div>
  )
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function deriveFromRaw(raw: string): { month: string; day: string; payee: string } {
  const parsed = safeParse(raw)
  if (parsed) {
    const { date, payee, narration } = parsed.bean
    const title = (payee?.trim() || narration?.trim() || 'Transaction')
    return {
      month: MONTHS[date.month - 1] ?? '—',
      day: String(date.day).padStart(2, '0'),
      payee: title,
    }
  }
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+[*!]\s+(?:"([^"]*)"\s+)?(?:"([^"]*)")?/)
  if (m) {
    const month = MONTHS[Number(m[2]) - 1] ?? '—'
    const day = m[3]
    const payee = (m[4]?.trim() || m[5]?.trim() || 'Transaction')
    return { month, day, payee }
  }
  return { month: '—', day: '—', payee: 'Transaction' }
}

type FetchStatus = 'loading' | 'idle' | 'error'
type FetchState = {
  status: FetchStatus
  rows: Transaction[]
  total: number
  errorMsg: string | null
}

function useTransactions(page: number): FetchState {
  const [state, setState] = useState<FetchState>({
    status: 'loading',
    rows: [],
    total: 0,
    errorMsg: null,
  })
  useEffect(() => {
    const controller = new AbortController()
    setState((prev) => ({ ...prev, status: 'loading', errorMsg: null }))
    const offset = (page - 1) * PAGE_SIZE
    fetch(`/api/ledger/transactions?q=&limit=${PAGE_SIZE}&offset=${offset}`, {
      signal: controller.signal,
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as { rows: Transaction[]; total: number }
      })
      .then((data) =>
        setState({ status: 'idle', rows: data.rows, total: data.total, errorMsg: null }),
      )
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setState({ status: 'error', rows: [], total: 0, errorMsg: (e as Error).message })
      })
    return () => controller.abort()
  }, [page])
  return state
}

function CardsList({
  status,
  errorMsg,
  entries,
}: {
  status: FetchStatus
  errorMsg: string | null
  entries: Entry[]
}) {
  if (status === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center text-[12px] text-slate-400">
        loading…
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center text-[12px] text-error">
        failed to load — {errorMsg}
      </div>
    )
  }
  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[12px] text-slate-400">
        no transactions
      </div>
    )
  }
  return (
    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 relative z-10">
      {entries.map((entry, i) => {
        const preset = PRESETS[i % PRESETS.length]
        const { month, day, payee } = deriveFromRaw(entry.text)
        const row: CardRow = { ...preset, month, day, payee }
        const key = entry.snapshotId !== null ? `id-${entry.snapshotId}` : `idx-${i}`
        return <Card key={key} row={row} />
      })}
    </div>
  )
}

function TextPane({
  status,
  errorMsg,
  buffer,
  onBufferChange,
}: {
  status: FetchStatus
  errorMsg: string | null
  buffer: string
  onBufferChange: (v: string) => void
}) {
  if (status === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center text-[12px] text-slate-400">
        loading…
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center text-[12px] text-error">
        failed to load — {errorMsg}
      </div>
    )
  }
  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <CodeMirror
        className="h-full"
        value={buffer}
        onChange={onBufferChange}
        extensions={scandiBeancountExtensions}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: false,
          highlightActiveLineGutter: true,
          foldGutter: false,
          autocompletion: false,
          searchKeymap: false,
          bracketMatching: false,
          indentOnInput: false,
        }}
      />
    </div>
  )
}

type DiffLine = { kind: 'add' | 'del' | 'ctx'; text: string }
type Hunk = { header: string; lines: DiffLine[] }

const DIFF_CONTEXT = 2

function computeHunks(baseline: string, current: string): Hunk[] {
  if (baseline === current) return []
  const parts = diffLines(baseline, current)
  const flat: DiffLine[] = []
  for (const p of parts) {
    const kind: DiffLine['kind'] = p.added ? 'add' : p.removed ? 'del' : 'ctx'
    const body = p.value.endsWith('\n') ? p.value.slice(0, -1) : p.value
    const lines = body.length === 0 ? [''] : body.split('\n')
    for (const l of lines) flat.push({ kind, text: l })
  }
  const changeIdx: number[] = []
  for (let i = 0; i < flat.length; i++) if (flat[i].kind !== 'ctx') changeIdx.push(i)
  const hunks: Hunk[] = []
  let i = 0
  while (i < changeIdx.length) {
    const start = Math.max(0, changeIdx[i] - DIFF_CONTEXT)
    let end = changeIdx[i]
    let j = i
    while (j + 1 < changeIdx.length && changeIdx[j + 1] - end <= DIFF_CONTEXT * 2) {
      j++
      end = changeIdx[j]
    }
    end = Math.min(flat.length - 1, end + DIFF_CONTEXT)
    const slice = flat.slice(start, end + 1)
    const firstChange = slice.find((l) => l.kind !== 'ctx')
    const ctx = slice.find((l) => l.kind === 'ctx' && l.text.trim().length > 0)
    const header = makeHunkHeader(firstChange?.text ?? '', ctx?.text ?? '')
    hunks.push({ header, lines: slice })
    i = j + 1
  }
  return hunks
}

function makeHunkHeader(changeLine: string, ctxLine: string): string {
  const txnLine = /^\d{4}-\d{2}-\d{2}/.test(ctxLine) ? ctxLine : changeLine
  const m = txnLine.match(/^\d{4}-\d{2}-\d{2}\s+[*!]\s+(?:"([^"]*)")?(?:\s+"([^"]*)")?/)
  if (m) {
    const bits = [m[1]?.trim(), m[2]?.trim()].filter(Boolean)
    if (bits.length > 0) return `@@ ${bits.join(' · ').toLowerCase()} @@`
  }
  return '@@ change @@'
}

function DiffPane({ baseline, current }: { baseline: string; current: string }) {
  const hunks = useMemo(() => computeHunks(baseline, current), [baseline, current])
  if (hunks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400">
        no changes
      </div>
    )
  }
  return (
    <div className="flex-1 overflow-y-auto p-4 text-[11px] font-mono">
      {hunks.map((h, idx) => (
        <div key={idx} className={idx < hunks.length - 1 ? 'mb-4' : ''}>
          <div className="text-slate-400 mb-1 text-[10px] uppercase">{h.header}</div>
          {h.lines.map((line, li) => {
            if (line.kind === 'add') {
              return (
                <div key={li} className="bg-sky-50 text-navy-600 flex px-2 py-0.5">
                  <span className="text-sky-600 w-4 shrink-0 select-none">+</span>
                  <span className="whitespace-pre">{line.text}</span>
                </div>
              )
            }
            if (line.kind === 'del') {
              return (
                <div key={li} className="bg-error/5 text-navy-600 flex px-2 py-0.5">
                  <span className="text-error w-4 shrink-0 select-none">-</span>
                  <span className="whitespace-pre line-through">{line.text}</span>
                </div>
              )
            }
            return (
              <div key={li} className="text-slate-400 flex px-2 py-0.5">
                <span className="w-4 shrink-0 select-none"> </span>
                <span className="whitespace-pre">{line.text}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function PageControls({
  page,
  totalPages,
  onPage,
}: {
  page: number
  totalPages: number
  onPage: (p: number) => void
}) {
  const prevDisabled = page <= 1
  const nextDisabled = page >= totalPages
  return (
    <div className="h-8 shrink-0 border-t border-slate-100 flex items-center justify-between px-4 bg-white">
      <button
        onClick={() => onPage(page - 1)}
        disabled={prevDisabled}
        className={
          prevDisabled
            ? 'text-[11px] text-slate-300 cursor-not-allowed flex items-center gap-1'
            : 'text-[11px] text-slate-500 hover:text-navy-600 transition-colors flex items-center gap-1'
        }
      >
        <span className="material-symbols-outlined text-[14px]">arrow_back</span> prev
      </button>
      <span className="text-[11px] text-slate-400 tabular-nums">
        page {page} of {Math.max(1, totalPages)}
      </span>
      <button
        onClick={() => onPage(page + 1)}
        disabled={nextDisabled}
        className={
          nextDisabled
            ? 'text-[11px] text-slate-300 cursor-not-allowed flex items-center gap-1'
            : 'text-[11px] text-slate-500 hover:text-navy-600 transition-colors flex items-center gap-1'
        }
      >
        next <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
      </button>
    </div>
  )
}

export function LedgerNewView() {
  const [page, setPage] = useState(1)
  const state = useTransactions(page)
  const snapshots = useMemo(() => buildSnapshots(state.rows), [state.rows])
  const baseline = useMemo(
    () => composeBuffer(state.rows.map((r) => r.raw_text)),
    [state.rows],
  )
  const [buffer, setBuffer] = useState(baseline)
  useEffect(() => {
    setBuffer(baseline)
  }, [baseline])

  const entries = useMemo(() => deriveEntries(buffer, snapshots), [buffer, snapshots])
  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE))
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])
  const first = state.rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const last = (page - 1) * PAGE_SIZE + state.rows.length
  const rangeLabel =
    state.status === 'loading'
      ? '…'
      : state.total === 0
        ? '0 of 0'
        : `${first}–${last} of ${state.total}`

  return (
    <div className="w-screen h-screen flex flex-col bg-scandi-bg text-navy-600 overflow-hidden font-sans">
      {/* Global header */}
      <header className="h-10 px-4 flex justify-between items-center bg-white shrink-0 z-20 border-b border-slate-200">
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-6 bg-navy-600 rounded flex items-center justify-center text-white font-bold text-[10px] shadow-sm">
            MV
          </div>
          <div className="font-semibold text-navy-600 tracking-tight text-sm flex items-center gap-2">
            milesvault <span className="text-slate-300 font-normal">/</span> ledger
          </div>
        </div>
        <div className="flex items-center gap-4 text-slate-500">
          <button className="hover:text-navy-600 transition-colors">
            <Icon name="search" className="text-[18px]" />
          </button>
          <button className="hover:text-navy-600 transition-colors">
            <Icon name="help" className="text-[18px]" />
          </button>
          <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700">
            AK
          </div>
        </div>
      </header>

      {/* Ledger action bar */}
      <div className="h-14 px-4 flex justify-between items-center bg-white border-b border-slate-200 shrink-0 z-10">
        <div className="flex items-center">
          <button className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-navy-600 text-white text-xs font-medium shadow-sm hover:bg-navy-700 transition-colors">
            <Icon name="add" className="text-[14px]" />
            new
          </button>
          <div className="w-3" />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700">
              merchant: swiggy
              <button className="ml-1 hover:text-navy-600">
                <Icon name="close" className="text-[14px]" />
              </button>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700">
              oct 2023
              <button className="ml-1 hover:text-navy-600">
                <Icon name="close" className="text-[14px]" />
              </button>
            </div>
            <button className="flex items-center gap-1 px-2 py-1 h-8 border border-dashed border-slate-300 rounded text-xs text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors">
              <Icon name="add" className="text-[14px]" /> filter
            </button>
            <div className="h-5 border-l border-slate-200 mx-2" />
            <button
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-slate-50 text-slate-400 transition-colors"
              title="Undo"
            >
              <Icon name="undo" className="text-[18px]" />
            </button>
            <button
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-slate-50 text-slate-400 transition-colors"
              title="Redo"
            >
              <Icon name="redo" className="text-[18px]" />
            </button>
            <div className="h-5 border-l border-slate-200 mx-2" />
          </div>
        </div>
        <div className="flex items-center">
          <button className="h-8 px-3 flex items-center justify-center rounded text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors">
            revert
          </button>
          <div className="w-2" />
          <button className="h-8 px-3 flex items-center justify-center rounded-md bg-navy-600 text-white text-xs font-medium hover:bg-navy-700 transition-colors shadow-sm gap-1">
            <div className="h-[6px] w-[6px] rounded-full bg-white/60" />
            save <Icon name="arrow_right" className="text-[14px]" />
          </button>
        </div>
      </div>

      {/* Three-pane body */}
      <main className="flex-1 flex gap-3 p-3 pb-0 overflow-hidden">
        {/* Cards pane */}
        <section className="flex-1 min-w-0 bg-white rounded-xl flex flex-col relative overflow-hidden border border-scandi-border">
          <div className="h-10 px-4 flex items-center justify-between border-b border-slate-100 shrink-0">
            <h2 className="text-navy-600 font-semibold text-[13px]">cards</h2>
            <h2 className="text-[11px] text-slate-400 tabular-nums">{rangeLabel}</h2>
          </div>
          <CardsList status={state.status} errorMsg={state.errorMsg} entries={entries} />
          <div className="absolute bottom-10 -right-6 text-navy-600 opacity-[0.03] select-none pointer-events-none">
            <Icon name="account_balance_wallet" className="!text-[180px]" />
          </div>
          <PageControls page={page} totalPages={totalPages} onPage={setPage} />
        </section>

        {/* Text pane */}
        <section className="flex-1 min-w-0 bg-white rounded-xl flex flex-col border border-scandi-border overflow-hidden relative">
          <div className="h-10 px-4 flex items-center justify-between border-b border-slate-100 shrink-0">
            <h2 className="text-[13px] font-semibold text-navy-600">text</h2>
            <button className="flex items-center gap-1 text-slate-400 hover:text-navy-600 transition-colors text-[11px]">
              <Icon name="content_copy" className="text-[14px]" /> copy
            </button>
          </div>
          <TextPane
            status={state.status}
            errorMsg={state.errorMsg}
            buffer={buffer}
            onBufferChange={setBuffer}
          />
        </section>

        {/* Diff + AI chat pane */}
        <section className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Diff */}
          <div className="h-[280px] bg-white rounded-xl flex flex-col border border-scandi-border overflow-hidden shrink-0">
            <div className="h-10 px-4 flex items-center justify-between border-b border-slate-100 shrink-0">
              <h2 className="text-navy-600 font-semibold text-[13px]">diff</h2>
              <div className="flex items-center gap-1 text-slate-300">
                <button className="hover:text-navy-600 transition-colors">
                  <Icon name="arrow_upward" className="text-[16px]" />
                </button>
                <button className="hover:text-navy-600 transition-colors">
                  <Icon name="arrow_downward" className="text-[16px]" />
                </button>
              </div>
            </div>
            <DiffPane baseline={baseline} current={buffer} />
          </div>

          {/* AI chat */}
          <div className="flex-1 bg-white rounded-xl flex flex-col border border-scandi-border overflow-hidden">
            <div className="h-10 px-4 flex items-center border-b border-slate-100 shrink-0 gap-2">
              <Icon name="auto_awesome" className="text-[14px] text-sky-600" />
              <h2 className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">
                ai · scribe
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-sm">
              <div className="flex flex-col items-end gap-1">
                <div className="bg-slate-100 text-navy-600 px-3 py-2 rounded-xl rounded-tr-sm max-w-[85%] text-xs shadow-sm">
                  Recategorize Swiggy and Meat Masterz to expenses:food:delivery. Split the
                  Amazon purchase into monitor and accessories.
                </div>
              </div>
              <div className="flex flex-col items-start gap-1">
                <div className="bg-white text-navy-600 px-3 py-2 rounded-xl rounded-tl-sm max-w-[85%] text-xs shadow-sm border border-slate-100">
                  Done. I&apos;ve staged those changes to the ledger.
                </div>
                <div className="mt-1 bg-white border border-sky-100 p-2 rounded-md flex flex-col gap-2 w-[240px] shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-medium text-navy-600">
                    <Icon name="auto_awesome" className="text-[14px] text-sky-600" />3 proposals
                  </div>
                  <button className="w-full bg-navy-600 text-white text-xs font-medium py-1.5 rounded hover:bg-navy-700 transition-colors flex justify-center items-center gap-1">
                    approve all <Icon name="arrow_right" className="text-[14px]" />
                  </button>
                  <div className="flex justify-between text-[10px] text-slate-400 px-1">
                    <button className="hover:text-navy-600">reject all</button>
                    <button className="hover:text-navy-600">show diff</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-3 border-t border-slate-100 shrink-0 bg-white">
              <div className="bg-slate-50 rounded-lg flex items-center px-3 h-10 border border-slate-200 focus-within:border-sky-300 transition-colors">
                <button className="text-slate-400 hover:text-slate-600 mr-2">
                  <Icon name="attachment" className="text-[18px]" />
                </button>
                <input
                  className="bg-transparent border-none focus:ring-0 focus:outline-none text-xs w-full text-navy-600 placeholder:text-slate-400"
                  placeholder="ask scribe anything..."
                  type="text"
                />
                <button className="text-slate-400 hover:text-slate-600 mx-2">
                  <Icon name="mic" className="text-[18px]" />
                </button>
                <button className="bg-navy-600 text-white rounded-md w-8 h-8 flex items-center justify-center hover:bg-navy-700 transition-colors shrink-0 shadow-sm">
                  <Icon name="arrow_upward" className="text-[16px]" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Status line */}
      <div className="h-5 bg-slate-100 flex items-center justify-center text-[11px] text-slate-400 shrink-0 border-t border-slate-200/50">
        last saved · 2 hours ago · sep statement reconcile
      </div>
    </div>
  )
}
