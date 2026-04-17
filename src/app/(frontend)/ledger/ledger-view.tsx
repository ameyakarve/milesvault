'use client'

import React, { useCallback, useEffect, useState } from 'react'
import type { Transaction } from '@/durable/ledger-types'
import { TextEditor } from './text-editor'

type ViewMode = 'cards' | 'text'

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; rows: Transaction[]; total: number }
  | { kind: 'error'; message: string }

export function LedgerView({ email }: { email: string }) {
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<ViewMode>('cards')
  const [state, setState] = useState<FetchState>({ kind: 'idle' })
  const [reloadNonce, setReloadNonce] = useState(0)
  const reload = useCallback(() => setReloadNonce((n) => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setState({ kind: 'loading' })
      fetch(`/api/ledger/transactions?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
        credentials: 'include',
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return (await res.json()) as { rows: Transaction[]; total: number }
        })
        .then((data) => setState({ kind: 'ok', rows: data.rows, total: data.total }))
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === 'AbortError') return
          setState({ kind: 'error', message: (e as Error).message })
        })
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [q, reloadNonce])

  return (
    <div className="min-h-screen bg-[#F7F3EC] text-[#0F1B2E]">
      <TopNav email={email} />
      <main className="flex w-full max-w-[2560px] mx-auto" style={{ height: 'calc(100vh - 64px)' }}>
        <LedgerPane
          q={q}
          onQ={setQ}
          mode={mode}
          onMode={setMode}
          state={state}
          onReload={reload}
        />
        <AssistantPane />
      </main>
    </div>
  )
}

function TopNav({ email }: { email: string }) {
  return (
    <nav className="sticky top-0 z-50 flex justify-between items-center px-8 h-16 w-full bg-[#F7F3EC]">
      <div className="flex items-center gap-8">
        <span className="font-serif text-2xl font-black text-[#0A2540]">MilesVault</span>
        <div className="hidden md:flex gap-6 items-center pt-1 font-serif text-lg tracking-tight font-medium">
          <a className="text-[#6B7889] font-normal hover:text-[#0A2540] transition-colors" href="#">
            Home
          </a>
          <a className="text-[#6B7889] font-normal hover:text-[#0A2540] transition-colors" href="#">
            Accounts
          </a>
          <a className="text-[#6B7889] font-normal hover:text-[#0A2540] transition-colors" href="#">
            Reports
          </a>
          <a className="text-[#0A2540] border-b-2 border-[#0A2540] pb-1" href="#">
            Ledger
          </a>
          <a className="text-[#6B7889] font-normal hover:text-[#0A2540] transition-colors" href="#">
            Cards
          </a>
        </div>
      </div>
      <div className="flex items-center gap-4 text-[#0A2540]">
        <span className="material-symbols-outlined cursor-pointer hover:opacity-70">settings</span>
        <span className="material-symbols-outlined cursor-pointer hover:opacity-70" title={email}>
          account_circle
        </span>
      </div>
    </nav>
  )
}

function LedgerPane({
  q,
  onQ,
  mode,
  onMode,
  state,
  onReload,
}: {
  q: string
  onQ: (v: string) => void
  mode: ViewMode
  onMode: (m: ViewMode) => void
  state: FetchState
  onReload: () => void
}) {
  const count = state.kind === 'ok' ? state.rows.length : 0
  const total = state.kind === 'ok' ? state.total : 0
  return (
    <section className="w-[62%] h-full overflow-y-auto px-12 py-8 flex flex-col gap-6">
      <LedgerHeader mode={mode} onMode={onMode} count={count} total={total} state={state} />
      <SearchBar q={q} onQ={onQ} />
      <LedgerBody mode={mode} state={state} onReload={onReload} />
    </section>
  )
}

function LedgerHeader({
  mode,
  onMode,
  count,
  total,
  state,
}: {
  mode: ViewMode
  onMode: (m: ViewMode) => void
  count: number
  total: number
  state: FetchState
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex bg-[#F1EDE6] rounded-full p-1 border border-black/10">
        <ModeToggle label="Cards" active={mode === 'cards'} onClick={() => onMode('cards')} />
        <ModeToggle label="Text" active={mode === 'text'} onClick={() => onMode('text')} />
      </div>
      <span className="text-[13px] text-muted font-medium">
        {state.kind === 'loading'
          ? 'Loading…'
          : state.kind === 'error'
            ? 'Error'
            : count === 0
              ? 'No transactions'
              : `Showing ${count} of ${total}`}
      </span>
    </div>
  )
}

function ModeToggle({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'px-4 py-1.5 rounded-full bg-white text-ink text-sm font-semibold shadow-sm'
          : 'px-4 py-1.5 rounded-full text-muted text-sm font-medium hover:text-ink'
      }
    >
      {label}
    </button>
  )
}

function SearchBar({ q, onQ }: { q: string; onQ: (v: string) => void }) {
  return (
    <div className="relative w-full flex items-center bg-white border border-black/10 rounded-full p-2 pl-4">
      <input
        type="text"
        value={q}
        onChange={(e) => onQ(e.target.value)}
        placeholder="@account #tag ^link >2026-03-01 2026-03-01..2026-04-01"
        className="w-full bg-transparent border-none py-2 pl-4 pr-4 font-mono text-sm text-ink placeholder-muted focus:outline-none focus:ring-0"
      />
    </div>
  )
}

function LedgerBody({
  mode,
  state,
  onReload,
}: {
  mode: ViewMode
  state: FetchState
  onReload: () => void
}) {
  if (state.kind === 'error') {
    return (
      <div className="py-24 text-center text-[#ba1a1a] font-mono text-sm">
        Failed to load — {state.message}
      </div>
    )
  }
  if (state.kind === 'idle' || state.kind === 'loading') {
    return (
      <div className="py-24 text-center font-serif italic text-muted text-sm">Loading…</div>
    )
  }
  if (mode === 'text') {
    return <TextEditor rows={state.rows} total={state.total} onReload={onReload} />
  }
  if (state.rows.length === 0) return <EmptyLedger />
  return (
    <div className="flex flex-col gap-4 pb-24">
      {state.rows.map((row) => (
        <TxnCard key={row.id} row={row} />
      ))}
      <div className="text-center pt-8">
        <span className="font-serif italic text-muted text-sm">
          — end · {state.rows.length} of {state.total} —
        </span>
      </div>
    </div>
  )
}

function EmptyLedger() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 gap-3">
      <span
        className="material-symbols-outlined !text-[48px] text-[#9B8B7A]"
        style={{ fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
      >
        receipt_long
      </span>
      <h2 className="font-serif text-xl text-ink">Your ledger is empty</h2>
      <p className="font-serif italic text-muted text-sm max-w-[32ch]">
        Draft your first transaction with the assistant on the right — or paste beancount text into
        the composer.
      </p>
    </div>
  )
}

function TxnCard({ row }: { row: Transaction }) {
  return (
    <article className="bg-white rounded-[12px] p-4 pl-5 pr-5 border border-black/10 transition-colors hover:bg-black/5">
      <pre className="font-mono text-[12px] text-[#2A2520] whitespace-pre-wrap m-0">
        {row.raw_text}
      </pre>
    </article>
  )
}

function AssistantPane() {
  return (
    <aside className="w-[38%] h-full bg-[#F1EDE6] border-l border-black/10 flex flex-col relative">
      <header className="h-20 px-8 flex items-center justify-between border-b border-black/10 bg-[#F1EDE6]">
        <h2 className="font-serif text-lg text-ink font-semibold">Assistant</h2>
        <span className="font-mono text-[10px] text-muted uppercase tracking-wider">
          CLERK · ALWAYS ON
        </span>
      </header>
      <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-10 pb-32">
        <p className="font-serif italic text-muted text-sm">
          Assistant panel — to be wired up next.
        </p>
      </div>
      <Composer />
    </aside>
  )
}

function Composer() {
  return (
    <div className="absolute bottom-0 left-0 right-0 px-8 py-6 bg-[#F1EDE6]">
      <div className="flex items-center gap-3 border-b border-black/20 pb-2">
        <span className="text-[#B8642F] font-mono text-[14px] font-semibold">›</span>
        <input
          type="text"
          placeholder="ask, or draft a new transaction…"
          className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-serif placeholder-muted px-0 py-1"
        />
        <span className="font-mono text-[10px] text-muted shrink-0">⏎ to send</span>
      </div>
    </div>
  )
}
