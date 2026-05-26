'use client'

import { useState } from 'react'
import { Chat } from './chat'
import { Journal } from './journal'

type Tab = 'chat' | 'journal'

export function EditorShell() {
  const [tab, setTab] = useState<Tab>('chat')

  return (
    <>
      <header className="flex items-center gap-1 border-b border-slate-200 px-6 py-3">
        <TabButton active={tab === 'chat'} onClick={() => setTab('chat')}>
          Chat
        </TabButton>
        <TabButton active={tab === 'journal'} onClick={() => setTab('journal')}>
          Journal
        </TabButton>
      </header>
      {tab === 'chat' ? <Chat /> : <Journal />}
    </>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[6px] px-3 py-1.5 text-sm transition ${
        active
          ? 'bg-slate-100 font-medium text-slate-900'
          : 'text-slate-500 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  )
}
