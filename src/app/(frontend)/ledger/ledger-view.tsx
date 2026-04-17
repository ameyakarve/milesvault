'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Transaction } from '@/durable/ledger-types'
import { TxnCard } from './card-patterns'
import { TextEditor } from './text-editor'

type ViewMode = 'cards' | 'text'

const PAGE_SIZE = 50

type FetchStatus = 'idle' | 'loading' | 'loadingMore' | 'error'

type FetchState = {
  status: FetchStatus
  rows: Transaction[]
  total: number
  errorMsg: string | null
}

const INITIAL_STATE: FetchState = {
  status: 'loading',
  rows: [],
  total: 0,
  errorMsg: null,
}

export function LedgerView({ email }: { email: string }) {
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<ViewMode>('cards')
  const [state, setState] = useState<FetchState>(INITIAL_STATE)
  const [reloadNonce, setReloadNonce] = useState(0)
  const reload = useCallback(() => setReloadNonce((n) => n + 1), [])

  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setState({ status: 'loading', rows: [], total: 0, errorMsg: null })
      fetch(
        `/api/ledger/transactions?q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&offset=0`,
        { signal: controller.signal, credentials: 'include' },
      )
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return (await res.json()) as { rows: Transaction[]; total: number }
        })
        .then((data) =>
          setState({
            status: 'idle',
            rows: data.rows,
            total: data.total,
            errorMsg: null,
          }),
        )
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === 'AbortError') return
          setState({
            status: 'error',
            rows: [],
            total: 0,
            errorMsg: (e as Error).message,
          })
        })
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [q, reloadNonce])

  const loadMore = useCallback(() => {
    const s = stateRef.current
    if (s.status !== 'idle') return
    if (s.rows.length >= s.total) return
    const offset = s.rows.length
    setState({ ...s, status: 'loadingMore' })
    fetch(
      `/api/ledger/transactions?q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&offset=${offset}`,
      { credentials: 'include' },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as { rows: Transaction[]; total: number }
      })
      .then((data) =>
        setState((prev) => ({
          status: 'idle',
          rows: [...prev.rows, ...data.rows],
          total: data.total,
          errorMsg: null,
        })),
      )
      .catch((e: unknown) =>
        setState((prev) => ({
          ...prev,
          status: 'error',
          errorMsg: (e as Error).message,
        })),
      )
  }, [q])

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-[#09090B]">
      <TopNav email={email} />
      <main className="flex w-full max-w-[2560px] mx-auto" style={{ height: 'calc(100vh - 48px)' }}>
        <LedgerPane
          q={q}
          onQ={setQ}
          mode={mode}
          onMode={setMode}
          state={state}
          onReload={reload}
          onLoadMore={loadMore}
        />
        <AssistantPane />
      </main>
    </div>
  )
}

function TopNav({ email }: { email: string }) {
  return (
    <nav className="sticky top-0 z-50 flex justify-between items-center px-6 h-12 w-full bg-[#FAFAF9] border-b border-zinc-200">
      <div className="flex items-center gap-8">
        <span className="font-mono text-[13px] tracking-[-0.01em] text-[#09090B] lowercase">
          milesvault
        </span>
        <div className="hidden md:flex items-center gap-6 font-sans text-[13px] tracking-[-0.01em]">
          <a className="text-zinc-500 hover:text-[#09090B] transition-colors" href="#">
            Home
          </a>
          <a className="text-zinc-500 hover:text-[#09090B] transition-colors" href="#">
            Accounts
          </a>
          <a className="text-zinc-500 hover:text-[#09090B] transition-colors" href="#">
            Reports
          </a>
          <a
            className="text-[#09090B] border-b border-[#09090B] leading-[48px] -mb-px"
            href="#"
          >
            Ledger
          </a>
          <a className="text-zinc-500 hover:text-[#09090B] transition-colors" href="#">
            Cards
          </a>
        </div>
      </div>
      <div className="flex items-center gap-3 text-zinc-500">
        <span className="material-symbols-outlined !text-[18px] cursor-pointer hover:text-[#09090B]">
          settings
        </span>
        <span
          className="material-symbols-outlined !text-[18px] cursor-pointer hover:text-[#09090B]"
          title={email}
        >
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
  onLoadMore,
}: {
  q: string
  onQ: (v: string) => void
  mode: ViewMode
  onMode: (m: ViewMode) => void
  state: FetchState
  onReload: () => void
  onLoadMore: () => void
}) {
  return (
    <section className="w-1/2 h-full overflow-hidden px-6 py-6 flex flex-col gap-4">
      <LedgerHeader mode={mode} onMode={onMode} state={state} />
      <SearchBar q={q} onQ={onQ} />
      <LedgerBody mode={mode} state={state} onReload={onReload} onLoadMore={onLoadMore} />
    </section>
  )
}

function LedgerHeader({
  mode,
  onMode,
  state,
}: {
  mode: ViewMode
  onMode: (m: ViewMode) => void
  state: FetchState
}) {
  const counter =
    state.status === 'loading'
      ? '…'
      : state.status === 'error' && state.rows.length === 0
        ? 'ERR'
        : `${state.rows.length} / ${state.total}`
  return (
    <div className="flex items-center justify-between">
      <SegmentedToggle mode={mode} onMode={onMode} />
      <span className="font-mono text-[11px] text-zinc-500 tabular-nums">{counter}</span>
    </div>
  )
}

function SegmentedToggle({
  mode,
  onMode,
}: {
  mode: ViewMode
  onMode: (m: ViewMode) => void
}) {
  return (
    <div className="inline-flex border border-zinc-200 rounded-[4px] overflow-hidden bg-white">
      <ModeToggle label="Cards" active={mode === 'cards'} onClick={() => onMode('cards')} />
      <div className="w-px bg-zinc-200" />
      <ModeToggle label="Text" active={mode === 'text'} onClick={() => onMode('text')} />
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
          ? 'px-3 h-7 text-[13px] font-medium text-[#09090B] bg-white'
          : 'px-3 h-7 text-[13px] text-zinc-500 hover:text-[#09090B] bg-transparent'
      }
    >
      {label}
    </button>
  )
}

function SearchBar({ q, onQ }: { q: string; onQ: (v: string) => void }) {
  return (
    <div className="relative flex items-center bg-white border border-zinc-200 rounded-[4px] px-3 focus-within:border-[#09090B] focus-within:ring-1 focus-within:ring-[#09090B]">
      <span className="material-symbols-outlined !text-[16px] text-zinc-400">search</span>
      <input
        type="text"
        value={q}
        onChange={(e) => onQ(e.target.value)}
        placeholder="@account #tag ^link >2026-03-01 2026-03-01..2026-04-01"
        className="w-full bg-transparent border-none py-2 pl-2 pr-2 font-mono text-[13px] text-[#09090B] placeholder-zinc-400 focus:outline-none focus:ring-0"
      />
    </div>
  )
}

function LedgerBody({
  mode,
  state,
  onReload,
  onLoadMore,
}: {
  mode: ViewMode
  state: FetchState
  onReload: () => void
  onLoadMore: () => void
}) {
  if (state.status === 'loading') {
    return (
      <div className="flex-1 min-h-0 py-16 text-center font-mono text-[13px] text-zinc-500">
        loading…
      </div>
    )
  }
  if (state.status === 'error' && state.rows.length === 0) {
    return (
      <div className="flex-1 min-h-0 py-16 text-center font-mono text-[13px] text-[#b91c1c]">
        failed to load — {state.errorMsg}
      </div>
    )
  }
  if (mode === 'text') {
    return <TextEditor rows={state.rows} onReload={onReload} />
  }
  if (state.rows.length === 0) {
    return (
      <div className="flex-1 min-h-0">
        <EmptyLedger />
      </div>
    )
  }
  return <CardsList state={state} onLoadMore={onLoadMore} />
}

function CardsList({
  state,
  onLoadMore,
}: {
  state: FetchState
  onLoadMore: () => void
}) {
  const hasMore = state.rows.length < state.total
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!hasMore) return
    const sentinel = sentinelRef.current
    const root = scrollRef.current
    if (!sentinel || !root) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) onLoadMore()
      },
      { root, rootMargin: '200px 0px', threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore, state.rows.length])

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto flex flex-col pb-16 border-t border-zinc-100"
    >
      {state.rows.map((row) => (
        <TxnCard key={row.id} raw={row.raw_text} />
      ))}
      {hasMore ? (
        <div
          ref={sentinelRef}
          className="pt-6 text-center font-mono text-[11px] text-zinc-500 tabular-nums"
        >
          {state.status === 'loadingMore'
            ? 'loading more…'
            : state.status === 'error'
              ? `failed — ${state.errorMsg} · `
              : ''}
          {state.status === 'error' ? (
            <button onClick={onLoadMore} className="underline hover:text-[#09090B]">
              retry
            </button>
          ) : null}
        </div>
      ) : (
        <div className="pt-6 text-center">
          <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
            — end · {state.rows.length} / {state.total} —
          </span>
        </div>
      )}
    </div>
  )
}

function EmptyLedger() {
  return (
    <div className="py-16 text-center font-mono text-[13px] text-zinc-500">
      no transactions · draft one with the assistant →
    </div>
  )
}

function AssistantPane() {
  return (
    <aside className="w-1/2 h-full bg-[#F4F4F5] border-l border-zinc-200 flex flex-col relative">
      <header className="h-12 px-6 flex items-center justify-between border-b border-zinc-200">
        <h2 className="font-sans text-[13px] font-medium text-[#09090B]">Assistant</h2>
        <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.08em]">
          CLERK · ALWAYS ON
        </span>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6 pb-24">
        <p className="font-mono text-[13px] text-zinc-500">
          assistant panel — to be wired up next.
        </p>
      </div>
      <Composer />
    </aside>
  )
}

function Composer() {
  return (
    <div className="absolute bottom-0 left-0 right-0 px-6 py-4 bg-[#F4F4F5] border-t border-zinc-200">
      <div className="flex items-center gap-3">
        <span className="text-zinc-600 font-mono text-[13px]">›</span>
        <input
          type="text"
          placeholder="ask, or draft a new transaction…"
          className="flex-1 bg-transparent border-none focus:ring-0 font-mono text-[13px] text-[#09090B] placeholder-zinc-400 px-0 py-1"
        />
        <span className="font-mono text-[10px] text-zinc-500 shrink-0 tracking-[0.08em] uppercase">
          ⏎ send
        </span>
      </div>
    </div>
  )
}
