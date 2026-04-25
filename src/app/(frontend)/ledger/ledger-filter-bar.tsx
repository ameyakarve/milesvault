'use client'

import { Search, Sparkles } from 'lucide-react'
import type { BufferState } from './buffer-state'

type SaveStatus = 'idle' | 'saving' | 'conflict' | 'error'

export function FilterBar({
  total,
  pageRows,
  saveStatus,
  bufferState,
  saveErrorMsg,
  saving,
  dirty,
  saveEnabled,
  locked,
  lastSavedAt,
  onSave,
  onRevert,
}: {
  total: number
  pageRows: number
  saveStatus: SaveStatus
  bufferState: BufferState
  saveErrorMsg: string | null
  saving: boolean
  dirty: boolean
  saveEnabled: boolean
  locked: boolean
  lastSavedAt: Date | null
  onSave: () => void
  onRevert: () => void
}) {
  return (
    <div className="flex flex-col bg-scandi-backdrop shrink-0 pl-[44px]">
      <div className="flex justify-between items-center h-9 pr-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">Filter:</span>
          <FilterChip tone="active">
            @expenses:food<span className="ml-1">×</span>
          </FilterChip>
          <Sep />
          <FilterChip tone="plain">
            Apr 2026<span className="ml-1 text-slate-400">⌄</span>
          </FilterChip>
          <Sep />
          <FilterChip tone="plain">
            #cashback<span className="ml-1 text-slate-400">⌄</span>
          </FilterChip>
          <Sep />
          <FilterChip tone="dashed">+ Filter</FilterChip>
          <Sep />
          <span className="text-[11px] font-mono text-slate-500 ml-1">
            {pageRows} of {total} txns
          </span>
        </div>
        <SaveIndicator
          saveStatus={saveStatus}
          bufferState={bufferState}
          saveErrorMsg={saveErrorMsg}
          saving={saving}
          dirty={dirty}
          lastSavedAt={lastSavedAt}
        />
      </div>
      <div className="flex items-center justify-between h-9 pr-2">
        <div className="flex items-center text-[10px] font-mono text-slate-400">
          <Key>⌘S</Key> <Cap>save</Cap>
          <DotSep />
          <Key>⌘K</Key> <Cap>search</Cap>
          <DotSep />
          <Key>⌘J</Key> <Cap>ask AI</Cap>
          <DotSep />
          <Key>/</Key> <Cap>cmds</Cap>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative h-7 bg-white border border-slate-200 rounded-[4px] flex items-center">
            <Search className="absolute left-2 text-slate-500" size={14} strokeWidth={1.5} />
            <input
              type="text"
              placeholder="search txns..."
              disabled
              className="w-[180px] h-full bg-transparent border-0 text-[12px] font-mono pl-8 pr-10 placeholder-slate-400 focus:outline-none focus:ring-0"
            />
            <span className="absolute right-2 text-[10px] font-mono text-slate-500 bg-slate-100 px-1 rounded">
              ⌘K
            </span>
          </div>
          <button
            type="button"
            disabled
            className="h-7 bg-transparent border border-transparent rounded-[4px] px-3 flex items-center hover:bg-slate-50 transition-colors disabled:opacity-60"
          >
            <Sparkles size={14} strokeWidth={1.5} className="text-slate-500" />
            <span className="ml-1.5 text-[11px] font-mono text-slate-600">Ask AI</span>
            <span className="ml-1.5 text-[10px] font-mono text-slate-500 bg-slate-100 px-1 rounded">
              ⌘J
            </span>
          </button>
          <button
            type="button"
            onClick={onRevert}
            disabled={!dirty || locked}
            title={saving ? 'revert (saving)' : 'revert / reset'}
            className="h-7 bg-transparent text-slate-600 border border-transparent rounded-[4px] px-3 text-[11px] font-mono hover:bg-slate-50 transition-colors flex items-center disabled:opacity-40 disabled:cursor-default"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!saveEnabled || locked}
            title={
              saving
                ? 'saving…'
                : bufferState.kind === 'dirty'
                  ? 'save (fix parse errors first)'
                  : bufferState.kind === 'staged' && !bufferState.validated
                    ? 'save (fix validation errors first)'
                    : 'save · ⌘S'
            }
            className="h-7 bg-scandi-accent text-white rounded-[4px] px-3 text-[11px] font-mono hover:opacity-90 transition-opacity flex items-center disabled:opacity-40 disabled:cursor-default"
          >
            Save
            <span className="ml-1.5 text-[10px] font-mono text-scandi-accent bg-white px-1 rounded font-bold">
              ⌘S
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

function FilterChip({
  tone,
  children,
}: {
  tone: 'active' | 'plain' | 'dashed'
  children: React.ReactNode
}) {
  const base =
    'px-2 py-0.5 rounded-[4px] text-[11px] font-mono flex items-center h-7 transition-colors'
  if (tone === 'active') {
    return (
      <span className={`${base} bg-white border border-scandi-accent text-scandi-accent`}>
        {children}
      </span>
    )
  }
  if (tone === 'dashed') {
    return (
      <span
        className={`${base} border border-dashed border-slate-300 text-slate-500 cursor-default`}
      >
        {children}
      </span>
    )
  }
  return (
    <span className={`${base} bg-white border border-slate-200 text-slate-700`}>{children}</span>
  )
}

function Sep() {
  return <span className="text-[11px] font-mono text-slate-300">·</span>
}

function DotSep() {
  return <span className="text-slate-300 mx-2">·</span>
}

function Key({ children }: { children: React.ReactNode }) {
  return <span className="text-slate-600 font-bold">{children}</span>
}

function Cap({ children }: { children: React.ReactNode }) {
  return <span className="ml-1">{children}</span>
}

function formatHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function SaveIndicator({
  saveStatus,
  bufferState,
  saveErrorMsg,
  saving,
  dirty,
  lastSavedAt,
}: {
  saveStatus: SaveStatus
  bufferState: BufferState
  saveErrorMsg: string | null
  saving: boolean
  dirty: boolean
  lastSavedAt: Date | null
}) {
  if (saving) {
    return (
      <Indicator color="bg-scandi-accent">
        <span className="text-slate-700 font-medium">saving…</span>
      </Indicator>
    )
  }
  if (saveStatus === 'error' || saveStatus === 'conflict') {
    return (
      <Indicator color="bg-rose-500">
        <span className="text-rose-700 font-medium">
          {saveStatus === 'conflict' ? 'conflict' : 'save failed'}
        </span>
        {saveErrorMsg ? <span className="text-slate-400"> · {saveErrorMsg}</span> : null}
      </Indicator>
    )
  }
  if (dirty) {
    const label =
      bufferState.kind === 'dirty'
        ? 'parse errors'
        : bufferState.kind === 'staged' && !bufferState.validated
          ? 'validation errors'
          : 'unsaved edits'
    return (
      <Indicator color="bg-amber-500">
        <span className="text-slate-700 font-medium">{label}</span>
        {lastSavedAt ? (
          <span className="text-slate-400"> · last saved {formatHHMM(lastSavedAt)}</span>
        ) : null}
      </Indicator>
    )
  }
  return (
    <Indicator color="bg-emerald-500">
      <span className="text-slate-500">
        {lastSavedAt ? `last saved ${formatHHMM(lastSavedAt)}` : 'saved'}
      </span>
    </Indicator>
  )
}

function Indicator({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-[6px] h-[6px] rounded-full ${color}`} />
      <div className="text-[11px] font-mono">{children}</div>
    </div>
  )
}
