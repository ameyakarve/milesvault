'use client'

import { useState } from 'react'
import { Chat } from './chat'
import { Journal } from './journal'

type Tab = 'chat' | 'journal'

export function EditorShell() {
  const [tab, setTab] = useState<Tab>('chat')

  return (
    <>
      <header className="flex items-center justify-center border-b border-slate-200/60 px-6 py-3">
        <SegmentedTabs value={tab} onChange={setTab} />
      </header>
      {tab === 'chat' ? <Chat /> : <Journal />}
    </>
  )
}

function SegmentedTabs({
  value,
  onChange,
}: {
  value: Tab
  onChange: (t: Tab) => void
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5">
      {(['chat', 'journal'] as const).map((t) => {
        const active = value === t
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={[
              'rounded-full px-3.5 py-1 text-[13px] font-medium transition',
              active
                ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                : 'text-slate-600 hover:text-slate-900',
            ].join(' ')}
          >
            {t === 'chat' ? 'Chat' : 'Journal'}
          </button>
        )
      })}
    </div>
  )
}
