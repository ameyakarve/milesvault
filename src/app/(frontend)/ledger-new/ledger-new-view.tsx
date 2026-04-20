'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { diffLines } from 'diff'
import type { Transaction } from '@/durable/ledger-types'
import { splitEntries } from '@/lib/beancount/extract'
import { safeParse } from '../ledger/card-patterns/types'
import {
  composeBuffer,
  scandiBeancountExtensions,
  setBaselineBuffer,
} from './editor'

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
  const resolved: (Snapshot | null)[] = parts.map((text) => {
    const candidates = byBody.get(text) ?? []
    const m = candidates.find((c) => !used.has(c.id))
    if (m) {
      used.add(m.id)
      return m
    }
    return null
  })
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

type CardPreset = {
  glyph: string
  narration: string
  account: string
  rewards: { old?: string; current: string }
  amount: string
  pill?: { label: string; kind: PillKind }
}

type CardRow = CardPreset & {
  month: string
  day: string
  payee: string
}

const PRESETS: CardPreset[] = [
  {
    glyph: 'restaurant',
    narration: '· dinner with r',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { old: '+87', current: '+5,800 pts' },
    amount: '-₹640.00',
  },
  {
    glyph: 'shopping_bag',
    narration: '· weekend restock',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+2,480 pts' },
    amount: '-₹320.00',
  },
  {
    glyph: 'directions_car',
    narration: '· ride to office',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+320 pts' },
    amount: '-₹450.00',
  },
  {
    glyph: 'restaurant',
    narration: '· weekend order',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { old: '+164', current: '+328 pts' },
    amount: '-₹1,250.00',
  },
  {
    glyph: 'account_balance',
    narration: '· oct statement payment',
    account: 'Assets:Bank:HDFC → Liabilities:CreditCard:Axis',
    rewards: { current: '—' },
    amount: '-₹48,200.00',
  },
  {
    glyph: 'inventory_2',
    narration: '· monitor & cables',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { old: '+45', current: '+90 pts' },
    amount: '-₹4,500.00',
    pill: { label: 'split', kind: 'split' },
  },
  {
    glyph: 'movie',
    narration: '· premium renewal',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+258 pts' },
    amount: '-₹1,292.00',
    pill: { label: 'forex', kind: 'forex' },
  },
  {
    glyph: 'local_activity',
    narration: '· dune part two',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+96 pts' },
    amount: '-₹480.00',
  },
  {
    glyph: 'restaurant_menu',
    narration: '· complimentary visit',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '—' },
    amount: '-₹0.00',
    pill: { label: 'benefit', kind: 'benefit' },
  },
  {
    glyph: 'redeem',
    narration: '· points → voucher',
    account: 'Assets:Rewards:Axis → Assets:GiftCards:Amazon',
    rewards: { current: '-35,000 pts' },
    amount: '+₹3,500.00',
  },
  {
    glyph: 'hotel',
    narration: '· delhi hotel',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+1,748 pts' },
    amount: '-₹8,740.00',
    pill: { label: 'dcc', kind: 'dcc' },
  },
  {
    glyph: 'payments',
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

function IconButton({
  name,
  title,
  onClick,
  disabled = false,
  active = false,
  size = 16,
  badge,
}: {
  name: string
  title: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  size?: number
  badge?: ReactNode
}) {
  const base = 'relative h-7 w-7 flex items-center justify-center rounded transition-colors'
  const state = disabled
    ? 'text-slate-300 cursor-default'
    : active
      ? 'text-navy-700 bg-slate-100'
      : 'text-slate-500 hover:bg-slate-100 hover:text-navy-700'
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${state}`}
      aria-label={title}
    >
      <Icon name={name} className={`text-[${size}px]`} />
      {badge}
    </button>
  )
}

function Pill({ label }: { kind: PillKind; label: string }) {
  return (
    <span className="bg-slate-100 text-slate-500 border border-slate-200 text-[9px] uppercase tracking-wider font-mono px-1 py-px rounded-none flex items-center leading-none ml-auto">
      {label}
    </span>
  )
}

function Card({ row, active }: { row: CardRow; active: boolean }) {
  const shell = active
    ? 'bg-slate-100 border-l-2 border-l-navy-600'
    : 'hover:bg-slate-50 border-l-2 border-l-transparent'

  return (
    <div
      className={`h-8 flex items-center pl-2 pr-3 gap-2 relative transition-colors font-mono text-[11px] border-b border-slate-100 ${shell}`}
    >
      <div className="w-10 text-slate-400 tabular-nums shrink-0 uppercase text-[10px]">
        {row.month}&nbsp;{row.day}
      </div>
      <Icon name={row.glyph} className="text-[12px] text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-navy-600 font-medium truncate max-w-[14ch]">{row.payee}</span>
        <span className="text-slate-400 truncate">{row.narration}</span>
        {row.pill && <Pill kind={row.pill.kind} label={row.pill.label} />}
      </div>
      <div className="w-[72px] text-right shrink-0 tabular-nums text-[10px]">
        {row.rewards.old ? (
          <>
            <span className="text-slate-300 line-through">{row.rewards.old}</span>
            <span className="text-slate-300 mx-1">→</span>
            <span className="text-sky-600">{row.rewards.current}</span>
          </>
        ) : (
          <span className="text-slate-500">{row.rewards.current}</span>
        )}
      </div>
      <div
        className={`w-[104px] text-right shrink-0 tabular-nums ${
          row.amount.startsWith('-') ? 'text-navy-700' : 'text-emerald-700'
        }`}
      >
        {row.amount}
      </div>
    </div>
  )
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function deriveFromRaw(raw: string): { month: string; day: string; payee: string } {
  const parsed = safeParse(raw)
  if (parsed) {
    const { date, payee, narration } = parsed.bean
    const title = payee?.trim() || narration?.trim() || 'Transaction'
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
    const payee = m[4]?.trim() || m[5]?.trim() || 'Transaction'
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

function PaneHeader({
  children,
  action,
  className = '',
}: {
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`h-7 shrink-0 px-3 flex items-center justify-between bg-white ${className}`}
    >
      <h2 className="text-[11px] font-mono font-semibold uppercase tracking-[0.08em] text-navy-700">
        {children}
      </h2>
      {action ?? null}
    </div>
  )
}

function CardsList({
  status,
  errorMsg,
  entries,
  activeIdx,
}: {
  status: FetchStatus
  errorMsg: string | null
  entries: Entry[]
  activeIdx: number | null
}) {
  if (status === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400 font-mono">
        loading…
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center text-[11px] text-error font-mono">
        failed to load — {errorMsg}
      </div>
    )
  }
  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400 font-mono">
        no transactions
      </div>
    )
  }
  return (
    <div className="flex-1 overflow-y-auto flex flex-col relative z-10">
      {entries.map((entry, i) => {
        const preset = PRESETS[i % PRESETS.length]
        const { month, day, payee } = deriveFromRaw(entry.text)
        const row: CardRow = { ...preset, month, day, payee }
        const key = entry.snapshotId !== null ? `id-${entry.snapshotId}` : `idx-${i}`
        return <Card key={key} row={row} active={activeIdx === i} />
      })}
    </div>
  )
}

function TextPane({
  status,
  errorMsg,
  buffer,
  onBufferChange,
  onCreateEditor,
  onCursorChange,
}: {
  status: FetchStatus
  errorMsg: string | null
  buffer: string
  onBufferChange: (v: string) => void
  onCreateEditor: (view: EditorView) => void
  onCursorChange: (pos: number) => void
}) {
  const cursorExtension = useMemo(
    () =>
      EditorView.updateListener.of((u) => {
        if (u.selectionSet || u.docChanged) {
          onCursorChange(u.state.selection.main.head)
        }
      }),
    [onCursorChange],
  )
  if (status === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400 font-mono">
        loading…
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center text-[11px] text-error font-mono">
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
        onCreateEditor={onCreateEditor}
        extensions={[...scandiBeancountExtensions, cursorExtension]}
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
    const header = makeHunkTitle(firstChange?.text ?? '', ctx?.text ?? '')
    hunks.push({ header, lines: slice })
    i = j + 1
  }
  return hunks
}

function makeHunkTitle(changeLine: string, ctxLine: string): string {
  const txnLine = /^\d{4}-\d{2}-\d{2}/.test(ctxLine) ? ctxLine : changeLine
  const m = txnLine.match(/^\d{4}-\d{2}-\d{2}\s+[*!]\s+(?:"([^"]*)")?(?:\s+"([^"]*)")?/)
  if (m) {
    const bits = [m[1]?.trim(), m[2]?.trim()].filter(Boolean)
    if (bits.length > 0) return bits.join(' · ').toLowerCase()
  }
  return 'change'
}

function DiffPane({ baseline, current }: { baseline: string; current: string }) {
  const hunks = useMemo(() => computeHunks(baseline, current), [baseline, current])
  const fileTitle = hunks[0]?.header ?? null

  return (
    <>
      <div className="h-6 shrink-0 px-3 flex items-center bg-sky-50 border-b border-sky-100">
        <span className="text-[11px] font-mono font-medium text-navy-700">
          {fileTitle ?? 'no pending changes'}
        </span>
      </div>
      {hunks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400 font-mono">
          buffer matches baseline
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-2 text-[11px] font-mono leading-[1.5]">
          {hunks.map((h, idx) => (
            <div key={idx} className={idx < hunks.length - 1 ? 'mb-3' : ''}>
              {idx > 0 && (
                <div className="text-slate-500 text-[10px] uppercase tracking-wider px-3 py-0.5 border-t border-slate-100">
                  {h.header}
                </div>
              )}
              {h.lines.map((line, li) => {
                if (line.kind === 'add') {
                  return (
                    <div key={li} className="bg-emerald-50 text-navy-700 flex px-3 border-l-2 border-emerald-500">
                      <span className="text-emerald-700 w-3 shrink-0 select-none">+</span>
                      <span className="whitespace-pre">{line.text}</span>
                    </div>
                  )
                }
                if (line.kind === 'del') {
                  return (
                    <div key={li} className="bg-red-50 text-navy-700 flex px-3 border-l-2 border-red-400">
                      <span className="text-red-700 w-3 shrink-0 select-none">-</span>
                      <span className="whitespace-pre line-through">{line.text}</span>
                    </div>
                  )
                }
                return (
                  <div key={li} className="text-slate-400 flex px-3">
                    <span className="w-3 shrink-0 select-none"> </span>
                    <span className="whitespace-pre">{line.text}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function PaginationStrip({
  first,
  last,
  total,
  page,
  totalPages,
  onPage,
  bufferLines,
}: {
  first: number
  last: number
  total: number
  page: number
  totalPages: number
  onPage: (p: number) => void
  bufferLines: number
}) {
  const prevDisabled = page <= 1
  const nextDisabled = page >= totalPages
  return (
    <div className="h-9 shrink-0 bg-slate-100 border-t border-b border-slate-200 flex items-stretch font-mono text-[11px] text-navy-700">
      <div className="w-1/2 px-3 flex items-center text-slate-500 border-r border-slate-200">
        {total === 0 ? '0 of 0' : `showing ${first}\u2013${last} of ${total}`}
      </div>
      <div className="w-1/2 px-3 flex items-center justify-between">
        <div className="flex-1 flex items-center justify-center gap-1">
          <button
            type="button"
            aria-label="previous page"
            onClick={() => onPage(page - 1)}
            disabled={prevDisabled}
            className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
              prevDisabled
                ? 'text-slate-300 cursor-default'
                : 'text-slate-500 hover:bg-slate-200 hover:text-navy-700'
            }`}
          >
            <Icon name="chevron_left" className="text-[16px]" />
          </button>
          <span className="px-1 tabular-nums">
            page {page} of {Math.max(1, totalPages)}
          </span>
          <button
            type="button"
            aria-label="next page"
            onClick={() => onPage(page + 1)}
            disabled={nextDisabled}
            className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
              nextDisabled
                ? 'text-slate-300 cursor-default'
                : 'text-slate-500 hover:bg-slate-200 hover:text-navy-700'
            }`}
          >
            <Icon name="chevron_right" className="text-[16px]" />
          </button>
        </div>
        <span className="text-slate-500 tabular-nums">{bufferLines} lines</span>
      </div>
    </div>
  )
}

function allEntriesParse(entries: Entry[]): boolean {
  if (entries.length === 0) return true
  return entries.every((e) => safeParse(e.text) !== null)
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

  const liveEntries = useMemo(() => deriveEntries(buffer, snapshots), [buffer, snapshots])
  const [cardEntries, setCardEntries] = useState<Entry[]>(liveEntries)
  useEffect(() => {
    if (allEntriesParse(liveEntries)) setCardEntries(liveEntries)
  }, [liveEntries])

  const editorViewRef = useRef<EditorView | null>(null)
  useEffect(() => {
    const view = editorViewRef.current
    if (!view) return
    view.dispatch({ effects: setBaselineBuffer.of(baseline) })
  }, [baseline])

  const [cursorPos, setCursorPos] = useState(0)
  const activeIdx = useMemo(() => {
    const parts = splitEntries(buffer)
    const lines = buffer.split('\n')
    let offset = 0
    for (let i = 0; i < parts.length; i++) {
      const start = lines.slice(0, parts[i].startLine).reduce((s, l) => s + l.length + 1, 0)
      const end = lines.slice(0, parts[i].endLine + 1).reduce((s, l) => s + l.length + 1, 0)
      if (cursorPos >= start && cursorPos < end) {
        offset = i
        const live = liveEntries[i]
        if (!live) return null
        if (live.snapshotId !== null) {
          const found = cardEntries.findIndex((e) => e.snapshotId === live.snapshotId)
          if (found !== -1) return found
        }
        return offset < cardEntries.length ? offset : null
      }
    }
    return null
  }, [buffer, cursorPos, liveEntries, cardEntries])

  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE))
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])
  const first = state.rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const last = (page - 1) * PAGE_SIZE + state.rows.length
  const bufferLines = buffer.length === 0 ? 0 : buffer.split('\n').length

  const dirty = state.status === 'idle' && buffer !== baseline

  return (
    <div className="w-screen h-screen flex flex-col bg-white text-navy-700 overflow-hidden font-sans">
      <header className="h-8 px-3 flex justify-between items-center bg-white shrink-0 border-b border-slate-200">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-semibold text-navy-700 tracking-tight">milesvault</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-500">ledger</span>
        </div>
        <button
          type="button"
          title="account"
          className="h-6 w-6 flex items-center justify-center text-slate-500 hover:text-navy-700 transition-colors"
        >
          <Icon name="account_circle" className="text-[20px]" />
        </button>
      </header>

      <div className="h-10 px-2 flex justify-between items-center bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-1">
          <IconButton name="add" title="new entry" />
          <IconButton
            name="save"
            title="save"
            badge={
              dirty ? (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 bg-amber-500 rounded-full" />
              ) : undefined
            }
          />
          <IconButton name="history" title="revert" />
          <div
            className={`ml-1 h-6 px-2 flex items-center gap-1 text-[11px] font-mono rounded ${
              dirty ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'
            }`}
            aria-live="polite"
          >
            <Icon
              name={dirty ? 'radio_button_checked' : 'check_circle'}
              className="text-[12px]"
            />
            {dirty ? 'unsaved' : 'saved'}
          </div>
          <div className="w-px h-5 bg-slate-200 mx-2" />
          <IconButton name="filter_alt" title="filter" />
          <div className="h-6 pl-2 pr-1 bg-slate-100 flex items-center gap-1 text-[11px] font-mono text-navy-700 rounded">
            swiggy · oct 2025
            <button
              type="button"
              title="clear filter"
              className="h-4 w-4 flex items-center justify-center text-slate-500 hover:text-navy-700"
            >
              <Icon name="close" className="text-[12px]" />
            </button>
          </div>
        </div>
        <IconButton name="help" title="help" />
      </div>

      <main className="flex-1 flex overflow-hidden min-h-0">
        <section className="flex-[2] flex flex-col min-w-0 border-r border-slate-200">
          <div className="flex h-7 shrink-0 border-b border-slate-200">
            <PaneHeader className="w-1/2 border-r border-slate-200">ledger</PaneHeader>
            <PaneHeader
              className="w-1/2"
              action={
                <button
                  type="button"
                  title="copy buffer"
                  className="h-5 w-5 flex items-center justify-center text-slate-500 hover:text-navy-700 rounded hover:bg-slate-100 transition-colors"
                >
                  <Icon name="content_copy" className="text-[14px]" />
                </button>
              }
            >
              editor
            </PaneHeader>
          </div>

          <PaginationStrip
            first={first}
            last={last}
            total={state.total}
            page={page}
            totalPages={totalPages}
            onPage={setPage}
            bufferLines={bufferLines}
          />

          <div className="flex flex-1 min-h-0">
            <div className="w-1/2 border-r border-slate-200 flex flex-col min-h-0 overflow-hidden">
              <CardsList
                status={state.status}
                errorMsg={state.errorMsg}
                entries={cardEntries}
                activeIdx={activeIdx}
              />
            </div>
            <div className="w-1/2 flex flex-col min-h-0 overflow-hidden">
              <TextPane
                status={state.status}
                errorMsg={state.errorMsg}
                buffer={buffer}
                onBufferChange={setBuffer}
                onCreateEditor={(view) => {
                  editorViewRef.current = view
                  view.dispatch({ effects: setBaselineBuffer.of(baseline) })
                }}
                onCursorChange={setCursorPos}
              />
            </div>
          </div>

          <PaginationStrip
            first={first}
            last={last}
            total={state.total}
            page={page}
            totalPages={totalPages}
            onPage={setPage}
            bufferLines={bufferLines}
          />
        </section>

        <section className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0 flex flex-col border-b border-slate-200">
            <PaneHeader>changes</PaneHeader>
            <DiffPane baseline={baseline} current={buffer} />
          </div>

          <div className="h-[360px] shrink-0 flex flex-col">
            <PaneHeader>scribe</PaneHeader>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
              <div className="flex flex-col items-end gap-1">
                <div className="bg-slate-100 text-navy-700 px-2 py-1.5 max-w-[90%] text-[11px] font-mono border border-slate-200 rounded">
                  recategorize swiggy and meat masterz to expenses:food:delivery. split the
                  amazon purchase into monitor and accessories.
                </div>
              </div>
              <div className="flex flex-col items-start gap-2">
                <div className="bg-white text-navy-700 px-2 py-1.5 max-w-[90%] text-[11px] font-mono border border-slate-200 rounded">
                  done. i&apos;ve staged those changes to the ledger.
                </div>
                <div className="bg-amber-50/60 border-l-2 border-amber-500 w-full p-2 flex flex-col gap-2 rounded-r">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-amber-800">
                    <Icon name="auto_awesome" className="text-[12px]" />
                    staged proposals
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="flex-1 h-7 bg-navy-700 text-white text-[10px] font-mono uppercase tracking-wider hover:bg-navy-600 transition-colors rounded"
                    >
                      approve all
                    </button>
                    <button
                      type="button"
                      className="h-7 px-2 text-[10px] font-mono uppercase tracking-wider text-slate-500 hover:text-navy-700 border border-slate-200 rounded"
                    >
                      reject
                    </button>
                    <button
                      type="button"
                      className="h-7 px-2 text-[10px] font-mono uppercase tracking-wider text-slate-500 hover:text-navy-700 border border-slate-200 rounded"
                    >
                      diff
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-2 border-t border-slate-200 shrink-0 bg-white">
              <div className="bg-slate-50 flex items-center px-2 h-8 border border-slate-200 focus-within:border-sky-300 transition-colors rounded">
                <input
                  className="bg-transparent border-none focus:ring-0 focus:outline-none text-[11px] font-mono w-full text-navy-700 placeholder:text-slate-400"
                  placeholder="ask scribe anything…"
                  type="text"
                />
                <button
                  type="button"
                  className="bg-navy-700 text-white w-6 h-6 flex items-center justify-center hover:bg-navy-600 transition-colors shrink-0 rounded"
                >
                  <Icon name="arrow_upward" className="text-[12px]" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
