'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  Camera,
  ChevronLeft,
  ChevronRight,
  Filter,
  Mic,
  MoreHorizontal,
  Search,
} from 'lucide-react'
import type { Transaction } from '@/durable/ledger-types'
import { format } from '@/lib/beancount/format'
import { type BufferState, evaluateBuffer } from '../ledger/buffer-state'
import { composeBuffer } from '../ledger/editor'
import { setAiSnapshots } from '../ledger/editor-ai-widget'
import type { LedgerEditorHandle } from '../ledger/ledger-editor'
import { TextPane } from '../ledger/ledger-panes'
import { buildSnapshots, PAGE_SIZE, useTransactions } from '../ledger/use-transactions'

function TopNav({ initial }: { initial: string }) {
  return (
    <nav className="hidden md:block w-full bg-white border-b border-slate-200">
      <div className="flex justify-between items-center w-full px-6 py-3 max-w-[960px] mx-auto">
        <div className="flex items-center space-x-6">
          <span className="text-[13px] font-black tracking-tighter text-navy-900 uppercase">
            milesvault
          </span>
          <div className="flex space-x-6">
            <a
              className="font-sans text-[12px] uppercase tracking-wider font-bold text-[#0891B2] border-b-2 border-[#0891B2] pb-1"
              href="#"
            >
              Ledger
            </a>
            <a
              className="font-sans text-[12px] uppercase tracking-wider font-bold text-slate-500 pb-1 hover:text-navy-900 transition-colors"
              href="#"
            >
              Dashboard
            </a>
            <a
              className="font-sans text-[12px] uppercase tracking-wider font-bold text-slate-500 pb-1 hover:text-navy-900 transition-colors"
              href="#"
            >
              Insights
            </a>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="w-6 h-6 rounded-full bg-[#F1F5F9] flex items-center justify-center">
            <span className="font-sans text-[11px] font-medium text-[#475569]">{initial}</span>
          </div>
        </div>
      </div>
    </nav>
  )
}

const MOBILE_ICON_BTN =
  'w-9 h-9 bg-slate-100 rounded-[8px] flex items-center justify-center text-slate-500'

function MobileTopNav() {
  return (
    <nav className="md:hidden w-full h-[56px] bg-white border-b border-slate-200 flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <ChevronLeft className="w-6 h-6 text-slate-600" strokeWidth={2} />
        <h1 className="text-[16px] font-semibold text-[#0F172A]">Ledger</h1>
      </div>
      <button
        type="button"
        aria-disabled
        aria-label="Menu"
        className="w-9 h-9 flex items-center justify-center text-slate-500"
      >
        <MoreHorizontal className="w-5 h-5" strokeWidth={2} />
      </button>
    </nav>
  )
}

function MobileAiBar() {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)] shadow-[0_-4px_12px_rgba(15,23,42,0.06)]">
      <div className="flex items-center gap-2 h-[40px]">
        <button type="button" aria-disabled aria-label="Voice input" className={MOBILE_ICON_BTN}>
          <Mic className="w-5 h-5" strokeWidth={2} />
        </button>
        <button type="button" aria-disabled aria-label="Camera" className={MOBILE_ICON_BTN}>
          <Camera className="w-5 h-5" strokeWidth={2} />
        </button>
        <div className="flex-1 h-10 bg-[#F1F5F9] border border-slate-200 rounded-full px-4 flex items-center">
          <span className="text-[14px] text-slate-400">Edit this card with AI…</span>
        </div>
        <button
          type="button"
          aria-disabled
          aria-label="Send"
          className="w-10 h-10 bg-[#0F172A] rounded-[8px] flex items-center justify-center text-white"
        >
          <ArrowUp className="w-5 h-5" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

function ChromeRow({
  total,
  shown,
  page,
  totalPages,
  onPage,
  pageLocked,
  dirty,
  saveEnabled,
  locked,
  onSave,
  onReset,
}: {
  total: number
  shown: number
  page: number
  totalPages: number
  onPage: (p: number) => void
  pageLocked: boolean
  dirty: boolean
  saveEnabled: boolean
  locked: boolean
  onSave: () => void
  onReset: () => void
}) {
  const prevDisabled = pageLocked || page <= 1
  const nextDisabled = pageLocked || page >= totalPages
  const saveRing = dirty
    ? 'ring-2 ring-amber-500 ring-offset-1 ring-offset-[#F4F6F8]'
    : ''
  return (
    <div className="sticky top-0 z-10 w-full h-[48px] mb-2 pl-2 md:pl-[44px] flex items-center gap-2 md:gap-3 bg-[#F4F6F8]">
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onSave}
          disabled={!saveEnabled || locked}
          className={`h-[36px] px-4 bg-[#0891B2] text-white rounded-[4px] flex items-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-default ${saveRing}`}
        >
          <span className="text-[13px] font-mono font-bold">Save</span>
          <span className="hidden md:inline-flex ml-2 text-[10px] font-mono font-bold bg-white/20 px-1.5 py-0.5 rounded-[2px]">
            ⌘S
          </span>
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!dirty || locked}
          className="ml-2 md:ml-3 h-[36px] px-3 text-[13px] font-mono font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 rounded-[4px] transition-colors disabled:opacity-40 disabled:cursor-default"
        >
          Reset
        </button>
        <div className="hidden md:block ml-3 pl-3 border-l border-slate-300">
          <span
            className={`text-[12px] font-mono font-medium ${dirty ? 'text-slate-700' : 'text-slate-400'}`}
          >
            {dirty ? 'unsaved edits' : 'all changes saved'}
          </span>
        </div>
      </div>
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={prevDisabled}
          aria-label="Previous page"
          className="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-slate-200/60 rounded-[4px] transition-colors disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-default"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={2} />
        </button>
        <span className="px-2 text-[12px] font-mono font-medium text-slate-700 tabular-nums">
          {shown} of {total}
        </span>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={nextDisabled}
          aria-label="Next page"
          className="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-slate-200/60 rounded-[4px] transition-colors disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-default"
        >
          <ChevronRight className="w-5 h-5" strokeWidth={2} />
        </button>
      </div>
      <button
        type="button"
        aria-disabled
        aria-label="Search"
        className="hidden md:flex flex-1 min-w-0 h-[36px] bg-slate-100 rounded-[4px] px-3 items-center text-slate-600 hover:bg-slate-200 transition-colors"
      >
        <Search className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
        <span className="ml-2 flex-1 text-left text-[13px] font-mono font-medium">
          Search txns…
        </span>
        <span className="text-[10px] font-mono font-bold text-slate-500 bg-white px-1.5 py-0.5 rounded-[2px] uppercase">
          ⌘K
        </span>
      </button>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          aria-disabled
          aria-label="Filter"
          className="w-9 h-9 bg-slate-100 rounded-[4px] flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors"
        >
          <Filter className="w-[18px] h-[18px]" strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-disabled
          aria-label="Search"
          className="md:hidden w-9 h-9 bg-slate-100 rounded-[4px] flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors"
        >
          <Search className="w-[18px] h-[18px]" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

export function LedgerNewView({ email }: { email: string }) {
  const initial = (email[0] ?? 'A').toUpperCase()
  const [page, setPage] = useState(1)
  const state = useTransactions(page)
  const snapshots = useMemo(() => buildSnapshots(state.rows), [state.rows])
  const baseline = useMemo(
    () => composeBuffer(state.rows.map((r) => r.raw_text)),
    [state.rows],
  )
  const [buffer, setBuffer] = useState(baseline)
  const editorRef = useRef<LedgerEditorHandle | null>(null)
  useEffect(() => {
    setBuffer(baseline)
    editorRef.current?.resetCursor()
  }, [baseline])
  useEffect(() => {
    editorRef.current?.getView()?.dispatch({ effects: setAiSnapshots.of(snapshots) })
  }, [snapshots])

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'conflict' | 'error'>('idle')
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null)
  const locked = saveStatus === 'saving'

  async function onSave() {
    if (locked) return
    const verdict = evaluateBuffer(buffer, baseline)
    if (verdict.kind !== 'staged' || !verdict.validated) {
      setBufferState(verdict)
      return
    }
    const formatted = format(buffer)
    if (formatted !== buffer) {
      editorRef.current?.replaceDoc(formatted)
      setBuffer(formatted)
    }
    setSaveStatus('saving')
    setSaveErrorMsg(null)
    const knownIds = snapshots.map((s) => ({
      id: s.id,
      expected_updated_at: s.expected_updated_at,
    }))
    try {
      const res = await fetch('/api/ledger/transactions/buffer', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ knownIds, buffer: formatted }),
      })
      if (res.status === 409) {
        setSaveStatus('conflict')
        setSaveErrorMsg('buffer out of date — reload and retry')
        return
      }
      if (!res.ok) {
        const body = (await res.json().catch((): null => null)) as { errors?: string[] } | null
        setSaveStatus('error')
        setSaveErrorMsg(body?.errors?.join('; ') ?? `HTTP ${res.status}`)
        return
      }
      const payload = (await res.json().catch((): null => null)) as {
        transactions?: Transaction[]
      } | null
      if (!payload?.transactions) {
        setSaveStatus('error')
        setSaveErrorMsg('save succeeded but response was malformed')
        return
      }
      state.replaceRows(payload.transactions)
      setSaveStatus('idle')
    } catch (e) {
      setSaveStatus('error')
      setSaveErrorMsg(e instanceof Error ? e.message : String(e))
    }
  }

  function onRevert() {
    setBuffer(baseline)
    setSaveStatus('idle')
    setSaveErrorMsg(null)
  }

  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE))
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])
  const [bufferState, setBufferState] = useState<BufferState>({ kind: 'clean' })
  useEffect(() => {
    if (state.status !== 'idle' || buffer === baseline) {
      setBufferState((prev) => (prev.kind === 'clean' ? prev : { kind: 'clean' }))
      return
    }
    setBufferState((prev) => (prev.kind === 'pending' ? prev : { kind: 'pending' }))
    const handle = setTimeout(() => {
      setBufferState(evaluateBuffer(buffer, baseline))
    }, 250)
    return () => clearTimeout(handle)
  }, [buffer, baseline, state.status])
  const dirty = bufferState.kind !== 'clean'
  const saveEnabled =
    bufferState.kind === 'pending' ||
    (bufferState.kind === 'staged' && bufferState.validated)
  const pageLocked = locked || dirty

  return (
    <div className="h-screen flex flex-col bg-[#F4F6F8] text-navy-900 font-sans overflow-x-hidden">
      <TopNav initial={initial} />
      <MobileTopNav />
      <div className="flex-1 flex w-full min-h-0">
        <main className="flex-1 overflow-y-auto min-w-0">
          <div className="w-full max-w-[960px] flex flex-col pt-1 pb-[120px] md:pb-6 px-4 md:px-0 mx-auto">
            <ChromeRow
              total={state.total}
              shown={state.rows.length}
              page={page}
              totalPages={totalPages}
              onPage={setPage}
              pageLocked={pageLocked}
              dirty={dirty}
              saveEnabled={saveEnabled}
              locked={locked}
              onSave={onSave}
              onReset={onRevert}
            />
            <TextPane
              status={state.status}
              errorMsg={state.errorMsg}
              buffer={buffer}
              baseline={baseline}
              onBufferChange={setBuffer}
              onSave={onSave}
              readOnly={locked}
              editorRef={editorRef}
            />

            {saveErrorMsg && (
              <div className="mt-3 mx-auto text-[11px] font-mono text-red-600">
                {saveErrorMsg}
              </div>
            )}
          </div>
        </main>
        <AiRail />
      </div>
      <MobileAiBar />
    </div>
  )
}

function AiRail() {
  return (
    <aside className="hidden md:flex w-[360px] shrink-0 border-l border-slate-200 bg-[#F4F6F8] flex-col">
      <div className="flex items-center justify-between h-[36px] px-4 mt-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="w-[6px] h-[6px] rounded-full bg-teal-500" />
          <span className="font-sans text-[11px] uppercase tracking-wider font-bold text-slate-500">
            AI
          </span>
        </div>
        <button
          type="button"
          aria-disabled
          className="h-[24px] w-[24px] flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded-[4px]"
        >
          <MoreHorizontal className="w-[14px] h-[14px]" strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex-1 min-h-0" />
      <div className="px-3 pb-3 pt-2 border-t border-slate-100">
        <div className="flex items-center h-[36px] bg-white border border-slate-200 rounded-[6px] px-3">
          <span className="flex-1 text-[12px] font-sans text-slate-400">
            Edit this card with AI…
          </span>
          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1 rounded">
            ⌘J
          </span>
        </div>
      </div>
    </aside>
  )
}
