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
import { EntryCard, type CardPreset } from './ledger-card'
import { LedgerEditor } from './ledger-editor'

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

export function CardsList({
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
  if (status !== 'idle') return <PaneStatus status={status} errorMsg={errorMsg} />
  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400 font-mono">
        no transactions
      </div>
    )
  }
  return (
    <div className="flex-1 overflow-y-auto flex flex-col relative z-10 bg-[#E8EDF2] pb-0">
      {entries.map((entry, i) => {
        const preset = PRESETS[i % PRESETS.length]
        const key = entry.snapshotId !== null ? `id-${entry.snapshotId}` : `idx-${i}`
        return (
          <EntryCard key={key} text={entry.text} preset={preset} active={activeIdx === i} />
        )
      })}
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
  readOnly,
}: {
  status: FetchStatus
  errorMsg: string | null
  buffer: string
  baseline: string
  onBufferChange: (v: string) => void
  onCursorChange: (pos: number) => void
  readOnly?: boolean
}) {
  if (status !== 'idle') return <PaneStatus status={status} errorMsg={errorMsg} />
  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <LedgerEditor
        className="h-full"
        value={buffer}
        baseline={baseline}
        onChange={onBufferChange}
        onCursorChange={onCursorChange}
        readOnly={readOnly}
      />
    </div>
  )
}
