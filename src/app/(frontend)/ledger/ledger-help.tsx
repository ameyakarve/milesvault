'use client'

import { HelpCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type Row = { key: string; label: string }

const KEYBOARD: Row[] = [
  { key: '⌘ S', label: 'save buffer' },
  { key: '⌘ I', label: 'edit current transaction with AI' },
  { key: '⌘ Z', label: 'undo' },
  { key: '⌘ ⇧ Z', label: 'redo' },
  { key: 'Tab', label: 'indent posting line' },
]

const SLASH: Row[] = [
  { key: '/txn', label: 'insert dated transaction skeleton' },
  { key: '/comment', label: 'insert `;` comment line' },
  { key: '/ai', label: 'open AI widget for current entry' },
]

export function HelpButton() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    function onPointerDown(ev: PointerEvent) {
      const el = rootRef.current
      if (el && !el.contains(ev.target as Node)) setOpen(false)
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="help"
        title="help"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-[22px] h-[22px] flex items-center justify-center rounded-[4px] text-slate-500 hover:text-navy-700 hover:bg-slate-100 transition-colors"
      >
        <HelpCircle size={14} strokeWidth={1.5} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="help"
          className="absolute right-0 top-[28px] w-[320px] bg-white border border-slate-200 rounded-[6px] shadow-[0_4px_12px_rgba(15,23,42,0.08)] p-3 z-30 text-[12px]"
        >
          <Section title="Keyboard" rows={KEYBOARD} />
          <Section title="Slash commands" rows={SLASH} />
        </div>
      )}
    </div>
  )
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 mb-1.5">
        {title}
      </div>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.key} className="flex items-baseline gap-3">
            <span className="font-mono text-[11px] text-navy-700 min-w-[72px]">{r.key}</span>
            <span className="text-slate-600">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
