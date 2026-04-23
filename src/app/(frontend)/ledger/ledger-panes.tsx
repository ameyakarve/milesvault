'use client'

import {
  Banknote,
  Car,
  Film,
  Gift,
  Hotel,
  Landmark,
  Package,
  ShoppingBag,
  Ticket,
  Utensils,
  UtensilsCrossed,
} from 'lucide-react'
import type { Ref } from 'react'
import type { Posting, Transaction as BeanTxn } from 'beancount'
import { EntryCard, safeParseEntry, type CardPreset } from './ledger-card'
import { LedgerEditor, type LedgerEditorHandle } from './ledger-editor'

export type FetchStatus = 'loading' | 'idle' | 'error'
export type Entry = { text: string; snapshotId: number | null }

const PRESETS: CardPreset[] = [
  {
    glyph: Utensils,
    color: 'amber',
    narration: '· dinner with r',
    account: 'Liabilities:CC:Axis',
    rewards: { old: '+87', current: '+5,800 pts' },
    amount: '-₹640.00',
  },
  {
    glyph: ShoppingBag,
    color: 'indigo',
    narration: '· weekend restock',
    account: 'Liabilities:CC:Axis',
    rewards: { current: '+2,480 pts' },
    amount: '-₹320.00',
  },
  {
    glyph: Car,
    color: 'emerald',
    narration: '· ride to office',
    account: 'Liabilities:CC:Axis',
    rewards: { current: '+320 pts' },
    amount: '-₹450.00',
  },
  {
    glyph: Utensils,
    color: 'amber',
    narration: '· weekend order',
    account: 'Liabilities:CC:Axis',
    rewards: { old: '+164', current: '+328 pts' },
    amount: '-₹1,250.00',
  },
  {
    glyph: Landmark,
    color: 'slate',
    narration: '· oct statement payment',
    account: 'Assets:Bank:HDFC → Liabilities:CC:Axis',
    rewards: { current: '—' },
    amount: '-₹48,200.00',
  },
  {
    glyph: Package,
    color: 'indigo',
    narration: '· monitor & cables',
    account: 'Liabilities:CC:Axis',
    rewards: { old: '+45', current: '+90 pts' },
    amount: '-₹4,500.00',
    pill: { label: 'split', kind: 'split' },
  },
  {
    glyph: Film,
    color: 'rose',
    narration: '· premium renewal',
    account: 'Liabilities:CC:Axis',
    rewards: { current: '+258 pts' },
    amount: '-₹1,292.00',
    pill: { label: 'forex', kind: 'forex' },
  },
  {
    glyph: Ticket,
    color: 'rose',
    narration: '· dune part two',
    account: 'Liabilities:CC:Axis',
    rewards: { current: '+96 pts' },
    amount: '-₹480.00',
  },
  {
    glyph: UtensilsCrossed,
    color: 'amber',
    narration: '· complimentary visit',
    account: 'Liabilities:CC:Axis',
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
    account: 'Liabilities:CC:Axis',
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

function PaneStatus({
  status,
  errorMsg,
}: {
  status: FetchStatus
  errorMsg: string | null
}) {
  const base = 'flex-1 flex items-center justify-center text-[11px] font-mono'
  if (status === 'loading') return <div className={`${base} text-slate-400`}>loading…</div>
  return <div className={`${base} text-error`}>failed to load — {errorMsg}</div>
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

type DayItem = { entry: Entry; parsed: BeanTxn | null; listIndex: number }
type DayGroup = {
  key: string
  header: { weekday: string; day: number; month: string; year: number } | null
  items: DayItem[]
  total: { display: string | null; count: number }
}

function dateKeyFromText(text: string): string | null {
  const m = text.match(/^\s*(\d{4}-\d{2}-\d{2})/)
  return m?.[1] ?? null
}

function dayOutflow(items: DayItem[]): { display: string | null; count: number } {
  let sum = 0
  let currency: string | null | undefined
  let ok = true
  outer: for (const { parsed } of items) {
    if (!parsed) continue
    for (const p of parsed.postings as Posting[]) {
      if (!(p.account === 'Expenses' || p.account.startsWith('Expenses:'))) continue
      if (p.amount == null) { ok = false; break outer }
      const n = parseFloat(p.amount)
      if (!Number.isFinite(n)) { ok = false; break outer }
      const c = p.currency ?? null
      if (currency === undefined) currency = c
      else if (currency !== c) { ok = false; break outer }
      sum += n
    }
  }
  const count = items.length
  if (!ok || sum === 0) return { display: null, count }
  const abs = Math.abs(sum)
  if (currency === 'INR') {
    return {
      display: `−₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(abs)}`,
      count,
    }
  }
  if (currency === 'USD') {
    return {
      display: `−$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(abs)}`,
      count,
    }
  }
  return { display: null, count }
}

function groupEntries(entries: Entry[]): DayGroup[] {
  const groups: DayGroup[] = []
  let current: DayGroup | null = null
  entries.forEach((entry, i) => {
    const parsed = safeParseEntry(entry.text)
    const key = parsed
      ? `${parsed.date.year}-${String(parsed.date.month).padStart(2, '0')}-${String(parsed.date.day).padStart(2, '0')}`
      : (dateKeyFromText(entry.text) ?? 'unknown')
    if (!current || current.key !== key) {
      let header: DayGroup['header'] = null
      if (parsed) {
        const d = new Date(Date.UTC(parsed.date.year, parsed.date.month - 1, parsed.date.day))
        header = {
          weekday: WEEKDAYS[d.getUTCDay()] ?? '',
          day: parsed.date.day,
          month: MONTHS[parsed.date.month - 1] ?? '',
          year: parsed.date.year,
        }
      } else if (key !== 'unknown') {
        const [y, m, dd] = key.split('-').map(Number)
        const d = new Date(Date.UTC(y, m - 1, dd))
        header = {
          weekday: WEEKDAYS[d.getUTCDay()] ?? '',
          day: dd,
          month: MONTHS[m - 1] ?? '',
          year: y,
        }
      }
      current = { key, header, items: [], total: { display: null, count: 0 } }
      groups.push(current)
    }
    current.items.push({ entry, parsed, listIndex: i })
  })
  for (const g of groups) g.total = dayOutflow(g.items)
  return groups
}

function DayHeader({
  header,
  total,
}: {
  header: DayGroup['header']
  total: DayGroup['total']
}) {
  return (
    <div className="sticky top-0 z-20 h-[36px] px-4 flex items-center justify-between bg-white/90 backdrop-blur-sm border-b border-scandi-rule">
      <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.12em] text-slate-500">
        {header ? `${header.weekday} · ${header.day} ${header.month}` : 'unknown date'}
      </span>
      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
        {total.display && (
          <span className="tabular-nums font-semibold text-navy-700">{total.display}</span>
        )}
        <span className="tabular-nums">
          {total.count} txn{total.count === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}

export function CardsList({
  status,
  errorMsg,
  entries,
  activeIdx,
  scrollRef,
}: {
  status: FetchStatus
  errorMsg: string | null
  entries: Entry[]
  activeIdx: number | null
  scrollRef?: Ref<HTMLDivElement>
}) {
  if (status !== 'idle') return <PaneStatus status={status} errorMsg={errorMsg} />
  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400 font-mono">
        no transactions
      </div>
    )
  }
  const groups = groupEntries(entries)
  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto flex flex-col relative z-10 bg-white pb-0"
    >
      {groups.map((group, gi) => (
        <div key={group.key} className={gi === 0 ? '' : 'mt-3'}>
          <DayHeader header={group.header} total={group.total} />
          {group.items.map((item) => {
            const preset = PRESETS[item.listIndex % PRESETS.length]
            const key =
              item.entry.snapshotId !== null
                ? `id-${item.entry.snapshotId}`
                : `idx-${item.listIndex}`
            return (
              <EntryCard
                key={key}
                text={item.entry.text}
                preset={preset}
                parsed={item.parsed}
                active={activeIdx === item.listIndex}
                cardIdx={item.listIndex}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function TextPane({
  status,
  errorMsg,
  buffer,
  baseline,
  onBufferChange,
  onCursorChange,
  onSave,
  readOnly,
  editorRef,
}: {
  status: FetchStatus
  errorMsg: string | null
  buffer: string
  baseline: string
  onBufferChange: (v: string) => void
  onCursorChange: (pos: number) => void
  onSave?: () => void
  readOnly?: boolean
  editorRef?: Ref<LedgerEditorHandle>
}) {
  if (status !== 'idle') return <PaneStatus status={status} errorMsg={errorMsg} />
  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <LedgerEditor
        ref={editorRef}
        className="h-full"
        value={buffer}
        baseline={baseline}
        onChange={onBufferChange}
        onCursorChange={onCursorChange}
        onSave={onSave}
        readOnly={readOnly}
      />
    </div>
  )
}
