'use client'

import React, { useCallback, useEffect, useState } from 'react'
import type { Transaction } from '@/durable/ledger-types'
import { TxnCard } from './card-patterns'
import { TextEditor } from './text-editor'
import { LedgerAssistant } from '../chat/chat'

type ViewMode = 'cards' | 'text'

const PAGE_SIZE = 10

type FetchStatus = 'idle' | 'loading' | 'error'

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
  const [page, setPage] = useState(1)
  const [state, setState] = useState<FetchState>(INITIAL_STATE)
  const [reloadNonce, setReloadNonce] = useState(0)
  const reload = useCallback(() => setReloadNonce((n) => n + 1), [])

  useEffect(() => {
    setPage(1)
  }, [q])

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setState({ status: 'loading', rows: [], total: 0, errorMsg: null })
      const offset = (page - 1) * PAGE_SIZE
      fetch(
        `/api/ledger/transactions?q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&offset=${offset}`,
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
  }, [q, page, reloadNonce])

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
          page={page}
          onPage={setPage}
          onReload={reload}
        />
        <LedgerAssistant email={email} />
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
  page,
  onPage,
  onReload,
}: {
  q: string
  onQ: (v: string) => void
  mode: ViewMode
  onMode: (m: ViewMode) => void
  state: FetchState
  page: number
  onPage: (p: number) => void
  onReload: () => void
}) {
  return (
    <section className="w-1/2 h-full overflow-hidden px-6 py-6 flex flex-col gap-4">
      <LedgerHeader mode={mode} onMode={onMode} state={state} page={page} />
      <SearchBar q={q} onQ={onQ} />
      <LedgerBody
        mode={mode}
        state={state}
        page={page}
        onPage={onPage}
        onReload={onReload}
      />
    </section>
  )
}

function LedgerHeader({
  mode,
  onMode,
  state,
  page,
}: {
  mode: ViewMode
  onMode: (m: ViewMode) => void
  state: FetchState
  page: number
}) {
  const counter =
    state.status === 'loading'
      ? '…'
      : state.status === 'error' && state.rows.length === 0
        ? 'ERR'
        : rangeLabel(state, page)
  return (
    <div className="flex items-center justify-between">
      <SegmentedToggle mode={mode} onMode={onMode} />
      <span className="font-mono text-[11px] text-zinc-500 tabular-nums">{counter}</span>
    </div>
  )
}

function rangeLabel(state: FetchState, page: number): string {
  if (state.total === 0) return '0 / 0'
  const first = (page - 1) * PAGE_SIZE + 1
  const last = (page - 1) * PAGE_SIZE + state.rows.length
  return `${first}–${last} / ${state.total}`
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
  page,
  onPage,
  onReload,
}: {
  mode: ViewMode
  state: FetchState
  page: number
  onPage: (p: number) => void
  onReload: () => void
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
  if (mode !== 'text' && state.rows.length === 0) {
    return (
      <div className="flex-1 min-h-0">
        <EmptyLedger />
      </div>
    )
  }
  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE))
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <PageControls page={page} totalPages={totalPages} onPage={onPage} position="top" />
      {mode === 'text' ? (
        <TextEditor rows={state.rows} onReload={onReload} />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          {state.rows.map((row) => (
            <TxnCard key={row.id} raw={row.raw_text} />
          ))}
        </div>
      )}
      <PageControls page={page} totalPages={totalPages} onPage={onPage} position="bottom" />
    </div>
  )
}

function PageControls({
  page,
  totalPages,
  onPage,
  position,
}: {
  page: number
  totalPages: number
  onPage: (p: number) => void
  position: 'top' | 'bottom'
}) {
  const prevDisabled = page <= 1
  const nextDisabled = page >= totalPages
  const borderClass =
    position === 'top' ? 'border-y border-zinc-100' : 'border-t border-zinc-100'
  return (
    <div className={`flex items-center justify-between px-4 py-3 bg-white ${borderClass}`}>
      <button
        onClick={() => onPage(page - 1)}
        disabled={prevDisabled}
        className={
          prevDisabled
            ? 'font-mono text-[12px] text-zinc-300 cursor-not-allowed'
            : 'font-mono text-[12px] text-zinc-600 hover:text-[#09090B]'
        }
      >
        ← prev
      </button>
      <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
        page {page} of {totalPages}
      </span>
      <button
        onClick={() => onPage(page + 1)}
        disabled={nextDisabled}
        className={
          nextDisabled
            ? 'font-mono text-[12px] text-zinc-300 cursor-not-allowed'
            : 'font-mono text-[12px] text-zinc-600 hover:text-[#09090B]'
        }
      >
        next →
      </button>
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

