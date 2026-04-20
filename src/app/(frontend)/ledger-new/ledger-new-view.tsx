'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { diffLines } from 'diff'
import {
  ArrowUp,
  Banknote,
  Car,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Copy,
  Film,
  Filter,
  Gift,
  HelpCircle,
  Hotel,
  Landmark,
  type LucideIcon,
  Mic,
  Package,
  Paperclip,
  Plus,
  RotateCcw,
  Save,
  ShoppingBag,
  Ticket,
  Utensils,
  UtensilsCrossed,
  Wallet,
  X,
} from 'lucide-react'
import type { Transaction } from '@/durable/ledger-types'
import { splitEntries } from '@/lib/beancount/extract'
import { safeParse } from '../ledger/card-patterns/types'
import { composeBuffer } from './editor'
import { LedgerEditor } from './ledger-editor'

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

type CardColor = 'amber' | 'sky' | 'emerald' | 'rose' | 'indigo' | 'slate'

const COLOR_CLASSES: Record<CardColor, { icon: string; monthBg: string; monthText: string }> = {
  amber: { icon: 'text-amber-600', monthBg: 'bg-amber-50', monthText: 'text-amber-700' },
  sky: { icon: 'text-sky-600', monthBg: 'bg-sky-50', monthText: 'text-sky-700' },
  emerald: { icon: 'text-emerald-600', monthBg: 'bg-emerald-50', monthText: 'text-emerald-700' },
  rose: { icon: 'text-rose-600', monthBg: 'bg-rose-50', monthText: 'text-rose-700' },
  indigo: { icon: 'text-indigo-600', monthBg: 'bg-indigo-50', monthText: 'text-indigo-700' },
  slate: { icon: 'text-slate-500', monthBg: 'bg-slate-50', monthText: 'text-slate-600' },
}

type CardPreset = {
  glyph: LucideIcon
  color: CardColor
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
    glyph: Utensils,
    color: 'amber',
    narration: '· dinner with r',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { old: '+87', current: '+5,800 pts' },
    amount: '-₹640.00',
  },
  {
    glyph: ShoppingBag,
    color: 'indigo',
    narration: '· weekend restock',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+2,480 pts' },
    amount: '-₹320.00',
  },
  {
    glyph: Car,
    color: 'emerald',
    narration: '· ride to office',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+320 pts' },
    amount: '-₹450.00',
  },
  {
    glyph: Utensils,
    color: 'amber',
    narration: '· weekend order',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { old: '+164', current: '+328 pts' },
    amount: '-₹1,250.00',
  },
  {
    glyph: Landmark,
    color: 'slate',
    narration: '· oct statement payment',
    account: 'Assets:Bank:HDFC → Liabilities:CreditCard:Axis',
    rewards: { current: '—' },
    amount: '-₹48,200.00',
  },
  {
    glyph: Package,
    color: 'indigo',
    narration: '· monitor & cables',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { old: '+45', current: '+90 pts' },
    amount: '-₹4,500.00',
    pill: { label: 'split', kind: 'split' },
  },
  {
    glyph: Film,
    color: 'rose',
    narration: '· premium renewal',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+258 pts' },
    amount: '-₹1,292.00',
    pill: { label: 'forex', kind: 'forex' },
  },
  {
    glyph: Ticket,
    color: 'rose',
    narration: '· dune part two',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+96 pts' },
    amount: '-₹480.00',
  },
  {
    glyph: UtensilsCrossed,
    color: 'amber',
    narration: '· complimentary visit',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '—' },
    amount: '-₹0.00',
    pill: { label: 'benefit', kind: 'benefit' },
  },
  {
    glyph: Gift,
    color: 'sky',
    narration: '· points → voucher',
    account: 'Assets:Rewards:Axis → Assets:GiftCards:Amazon',
    rewards: { current: '-35,000 pts' },
    amount: '+₹3,500.00',
  },
  {
    glyph: Hotel,
    color: 'emerald',
    narration: '· delhi hotel',
    account: 'Liabilities:CreditCard:Axis',
    rewards: { current: '+1,748 pts' },
    amount: '-₹8,740.00',
    pill: { label: 'dcc', kind: 'dcc' },
  },
  {
    glyph: Banknote,
    color: 'emerald',
    narration: '· oct salary credit',
    account: 'Income:Salary → Assets:Bank:HDFC',
    rewards: { current: '—' },
    amount: '+₹2,50,000.00',
  },
]

function ChromeIconButton({
  icon: IconCmp,
  title,
  onClick,
  disabled = false,
  dirty = false,
}: {
  icon: LucideIcon
  title: string
  onClick?: () => void
  disabled?: boolean
  dirty?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="w-[28px] h-[28px] flex items-center justify-center rounded-[2px] hover:bg-slate-50 transition-colors relative"
    >
      <IconCmp size={16} strokeWidth={1.5} className="text-slate-600" />
      {dirty && (
        <span className="absolute top-[6px] right-[6px] w-[6px] h-[6px] bg-amber-500 rounded-[2px]" />
      )}
    </button>
  )
}

function Card({ row, active }: { row: CardRow; active: boolean }) {
  const Glyph = row.glyph
  const palette = COLOR_CLASSES[row.color]
  const shell = active
    ? 'h-[52px] bg-slate-100 flex items-center px-3 gap-3 transition-colors relative border-b border-slate-100 w-full'
    : 'h-[52px] bg-white hover:bg-slate-50 flex items-center px-3 gap-3 relative transition-colors border-b border-slate-100 w-full'
  const dayBg = active ? 'bg-navy-50 text-navy-700' : 'bg-white text-navy-600'

  return (
    <div className={shell}>
      {active && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-navy-600" />}
      <div className="h-10 w-10 border border-slate-200 flex flex-col shrink-0 relative overflow-hidden bg-white">
        <div
          className={`h-[14px] ${palette.monthBg} ${palette.monthText} text-[9px] font-mono flex items-center justify-center uppercase leading-none border-b border-slate-200`}
        >
          {row.month}
        </div>
        <div
          className={`flex-1 text-[16px] font-mono flex items-center justify-center leading-none ${dayBg}`}
        >
          {row.day}
        </div>
      </div>
      <div
        className={`flex-1 min-w-[200px] flex flex-col justify-center ${active ? 'pl-[2px]' : ''}`}
      >
        <div className="flex items-center gap-1">
          <Glyph size={14} strokeWidth={1.5} className={palette.icon} />
          <span className="text-navy-600 text-[13px] font-medium truncate ml-1">{row.payee}</span>
          <span className="text-slate-400 text-[13px] italic truncate ml-1">{row.narration}</span>
          {row.pill && (
            <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[9px] uppercase font-mono px-1.5 py-0.5 flex items-center gap-1 leading-none ml-auto">
              {row.pill.label}
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400 truncate font-mono">{row.account}</div>
      </div>
      <div className="w-[60px] text-right shrink-0 font-mono flex flex-col justify-center border-l border-slate-200 pl-2">
        {row.rewards.old ? (
          <div className="text-[11px]">
            <span className="text-slate-300 line-through">{row.rewards.old}</span>
            <span className="text-slate-300 mx-1">→</span>
            <span className="text-sky-600 font-medium">{row.rewards.current}</span>
          </div>
        ) : (
          <div className="text-[11px] text-sky-600 font-medium">{row.rewards.current}</div>
        )}
      </div>
      <div className="text-right shrink-0 font-mono flex flex-col justify-center w-[104px] ml-2">
        <div className="text-navy-700 text-[12px] font-medium">{row.amount}</div>
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

function PaneLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-navy-700">
      {children}
    </h2>
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
    <div className="flex-1 overflow-y-auto flex flex-col relative z-10 bg-white pb-0">
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
  baseline,
  onBufferChange,
  onCursorChange,
}: {
  status: FetchStatus
  errorMsg: string | null
  buffer: string
  baseline: string
  onBufferChange: (v: string) => void
  onCursorChange: (pos: number) => void
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
  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <LedgerEditor
        className="h-full"
        value={buffer}
        baseline={baseline}
        onChange={onBufferChange}
        onCursorChange={onCursorChange}
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
      <div className="h-[24px] px-[12px] flex items-center bg-[#F0F9FF] border-b border-[#E0F2FE] shrink-0">
        <span className="font-mono text-[11px] font-medium text-[#0F172A]">
          {fileTitle ?? 'no pending changes'}
        </span>
      </div>
      {hunks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400 font-mono">
          buffer matches baseline
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 text-[11px] font-mono">
          {hunks.map((h, idx) => (
            <div key={idx} className={`${idx < hunks.length - 1 ? 'mb-4' : ''} group relative`}>
              {idx > 0 && (
                <div className="text-slate-500 text-[10px] uppercase tracking-wider py-0.5">
                  {h.header}
                </div>
              )}
              {h.lines.map((line, li) => {
                if (line.kind === 'add') {
                  return (
                    <div
                      key={li}
                      className="bg-emerald-50 text-emerald-700 flex px-2 py-0.5 border-l-[2px] border-emerald-600"
                    >
                      <span className="w-4 shrink-0 select-none font-medium">+</span>
                      <span className="whitespace-pre">{line.text}</span>
                    </div>
                  )
                }
                if (line.kind === 'del') {
                  return (
                    <div
                      key={li}
                      className="bg-red-50 text-red-500 flex px-2 py-0.5 border-l-[2px] border-red-500 line-through"
                    >
                      <span className="w-4 shrink-0 select-none">-</span>
                      <span className="whitespace-pre">{line.text}</span>
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
      )}
    </>
  )
}

function PaginationStrip({
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
    <div className="h-[32px] bg-[#F1F5F9] border-t border-b border-[#E2E8F0] flex items-center shrink-0 w-full relative">
      <div className="flex-1 flex items-center justify-center gap-2">
        <button
          type="button"
          aria-label="previous page"
          disabled={prevDisabled}
          onClick={() => onPage(page - 1)}
          className={
            prevDisabled
              ? 'w-[20px] h-[20px] flex items-center justify-center rounded-[4px] text-slate-500 opacity-30 cursor-default'
              : 'w-[20px] h-[20px] flex items-center justify-center rounded-[4px] text-slate-500 hover:bg-[#E2E8F0] hover:text-[#0F172A] transition-colors'
          }
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
        </button>
        <span className="font-mono text-[10px] text-navy-700">
          page {page} of {Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          aria-label="next page"
          disabled={nextDisabled}
          onClick={() => onPage(page + 1)}
          className={
            nextDisabled
              ? 'w-[20px] h-[20px] flex items-center justify-center rounded-[4px] text-slate-500 opacity-30 cursor-default'
              : 'w-[20px] h-[20px] flex items-center justify-center rounded-[4px] text-slate-500 hover:bg-[#E2E8F0] hover:text-[#0F172A] transition-colors'
          }
        >
          <ChevronRight size={14} strokeWidth={1.5} />
        </button>
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
  const dirty = state.status === 'idle' && buffer !== baseline

  return (
    <div className="w-screen h-screen flex flex-col bg-white text-navy-700 overflow-hidden font-sans">
      <header className="h-[32px] px-4 flex items-center bg-white shrink-0 z-20 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="font-sans font-medium text-navy-700 text-[13px]">milesvault</span>
          <span className="font-sans font-normal text-slate-500 text-[12px]">/ ledger</span>
        </div>
      </header>

      <div className="h-[40px] px-4 flex justify-between items-center bg-white border-b border-slate-200 shrink-0 z-10">
        <div className="flex items-center">
          <ChromeIconButton icon={Plus} title="new entry" />
          <ChromeIconButton icon={Save} title="save" dirty={dirty} />
          <ChromeIconButton icon={RotateCcw} title="revert" />
          <div
            className={`h-[24px] px-2 rounded-[4px] flex items-center gap-1.5 font-mono text-[11px] ml-1 ${
              dirty ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'
            }`}
            aria-live="polite"
          >
            <CircleDot size={12} strokeWidth={2} className={dirty ? 'text-amber-700' : 'text-emerald-700'} />
            {dirty ? 'unsaved' : 'saved'}
          </div>
          <div className="h-[16px] w-px bg-slate-200 mx-3" />
          <div className="flex items-center gap-1">
            <ChromeIconButton icon={Filter} title="filter" />
            <div className="flex items-center gap-1 pl-2 pr-1 h-[24px] bg-slate-100 text-[11px] font-mono text-navy-700 rounded-[4px]">
              swiggy · oct 2025
              <button
                type="button"
                title="clear filter"
                className="w-[16px] h-[16px] flex items-center justify-center hover:bg-slate-200 rounded-[2px] transition-colors"
              >
                <X size={12} className="text-slate-600" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChromeIconButton icon={HelpCircle} title="help" />
        </div>
      </div>

      <PaginationStrip page={page} totalPages={totalPages} onPage={setPage} />

      <main className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-[2] flex flex-col min-w-0 border-r border-slate-200">
          <div className="flex w-full shrink-0">
            <div className="flex-1 h-[28px] px-3 flex items-center border-b border-slate-200 border-r bg-white shrink-0">
              <PaneLabel>LEDGER</PaneLabel>
            </div>
            <div className="flex-1 h-[28px] px-3 flex items-center justify-between border-b border-slate-200 bg-white shrink-0">
              <PaneLabel>EDITOR</PaneLabel>
              <button
                type="button"
                title="copy buffer"
                className="w-[20px] h-[20px] flex items-center justify-center hover:bg-[#F1F5F9] transition-colors rounded-[4px] text-slate-500 hover:text-navy-700 mr-[12px]"
              >
                <Copy size={14} strokeWidth={1.5} />
              </button>
            </div>
          </div>
          <div className="flex flex-1 min-h-0">
            <section className="flex-1 min-w-0 bg-white flex flex-col relative overflow-hidden border-r border-slate-200">
              <CardsList
                status={state.status}
                errorMsg={state.errorMsg}
                entries={cardEntries}
                activeIdx={activeIdx}
              />
              <div className="absolute -bottom-6 -right-6 text-navy-600 opacity-[0.03] select-none pointer-events-none z-0">
                <Wallet size={180} strokeWidth={1.5} />
              </div>
            </section>
            <section className="flex-1 min-w-0 bg-white flex flex-col overflow-hidden relative">
              <TextPane
                status={state.status}
                errorMsg={state.errorMsg}
                buffer={buffer}
                baseline={baseline}
                onBufferChange={setBuffer}
                onCursorChange={setCursorPos}
              />
            </section>
          </div>
        </div>

        <section className="flex-1 min-w-0 flex flex-col">
          <div className="h-[280px] bg-white flex flex-col overflow-hidden shrink-0 border-b border-slate-200">
            <div className="h-[28px] px-3 flex items-center justify-between border-b border-slate-200 bg-white shrink-0">
              <PaneLabel>CHANGES</PaneLabel>
            </div>
            <DiffPane baseline={baseline} current={buffer} />
          </div>

          <div className="flex-1 bg-white flex flex-col overflow-hidden">
            <div className="h-[28px] px-3 flex items-center justify-between border-b border-slate-200 bg-white shrink-0 gap-2">
              <PaneLabel>ASSISTANT</PaneLabel>
            </div>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 text-[11px] font-mono">
              <div className="flex flex-col items-end gap-1">
                <div className="bg-amber-50/50 text-navy-600 px-3 py-2 border border-slate-200 border-l-[2px] border-l-amber-500 max-w-[85%]">
                  Recategorize Swiggy and Meat Masterz to expenses:food:delivery.
                </div>
              </div>
              <div className="flex flex-col items-start gap-1">
                <div className="bg-emerald-50 text-navy-600 px-3 py-2 max-w-[85%] border border-slate-200 border-l-[2px] border-l-emerald-500">
                  Done. I&apos;ve staged those changes to the ledger.
                </div>
              </div>
            </div>
            <div className="p-2 border-t border-slate-200 shrink-0 bg-white mt-auto">
              <div className="bg-white flex items-center px-2 h-[36px] border border-slate-200 focus-within:border-navy-600 transition-colors">
                <button
                  type="button"
                  title="attach"
                  className="w-[24px] h-[24px] flex items-center justify-center hover:bg-slate-50 hover:text-navy-600 text-slate-400 transition-colors rounded-[2px]"
                >
                  <Paperclip size={14} strokeWidth={1.5} />
                </button>
                <input
                  className="bg-transparent border-none focus:ring-0 focus:outline-none text-[11px] font-mono w-full text-navy-600 placeholder:text-slate-400"
                  placeholder="ask the assistant anything…"
                  type="text"
                />
                <button
                  type="button"
                  title="dictate"
                  className="w-[24px] h-[24px] flex items-center justify-center hover:bg-slate-50 hover:text-navy-600 text-slate-400 transition-colors rounded-[2px]"
                >
                  <Mic size={14} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  title="send"
                  className="bg-navy-600 text-white w-[24px] h-[24px] flex items-center justify-center hover:bg-navy-700 transition-colors shrink-0 ml-1 rounded-[2px]"
                >
                  <ArrowUp size={14} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PaginationStrip page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  )
}
