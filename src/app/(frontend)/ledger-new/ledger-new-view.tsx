'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal, Search, Sparkles } from 'lucide-react'
import type { Transaction } from '@/durable/ledger-types'
import { format } from '@/lib/beancount/format'
import { type BufferState, evaluateBuffer } from '../ledger/buffer-state'
import { composeBuffer } from '../ledger/editor'
import { setAiSnapshots } from '../ledger/editor-ai-widget'
import type { LedgerEditorHandle } from '../ledger/ledger-editor'
import { type FetchStatus, TextPane } from '../ledger/ledger-panes'

const PAGE_SIZE = 50

type Snapshot = { id: number; raw_text: string; expected_updated_at: number }

function buildSnapshots(rows: Transaction[]): Snapshot[] {
  return rows.map((r) => ({
    id: r.id,
    raw_text: r.raw_text.trim(),
    expected_updated_at: r.updated_at,
  }))
}

type FetchState = {
  status: FetchStatus
  rows: Transaction[]
  total: number
  errorMsg: string | null
}

function useTransactions(
  page: number,
): FetchState & { replaceRows: (rows: Transaction[]) => void } {
  const [state, setState] = useState<FetchState>({
    status: 'loading',
    rows: [],
    total: 0,
    errorMsg: null,
  })
  useEffect(() => {
    const controller = new AbortController()
    setState((prev) => ({ ...prev, status: 'loading', errorMsg: null }))
    const offset = (page - 1) * PAGE_SIZE
    fetch(`/api/ledger/transactions?q=&limit=${PAGE_SIZE}&offset=${offset}`, {
      signal: controller.signal,
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as { rows: Transaction[]; total: number }
      })
      .then((data) =>
        setState({ status: 'idle', rows: data.rows, total: data.total, errorMsg: null }),
      )
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setState({
          status: 'error',
          rows: [],
          total: 0,
          errorMsg: e instanceof Error ? e.message : String(e),
        })
      })
    return () => controller.abort()
  }, [page])
  return {
    ...state,
    replaceRows: (rows) =>
      setState((prev) => ({
        ...prev,
        rows,
        total: prev.total - prev.rows.length + rows.length,
      })),
  }
}

function TopNav() {
  return (
    <nav className="w-full bg-white border-b border-slate-200">
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
            <span className="font-sans text-[11px] font-medium text-[#475569]">A</span>
          </div>
        </div>
      </div>
    </nav>
  )
}

function ChromeRow({
  total,
  dirty,
  saveEnabled,
  locked,
  onSave,
  onReset,
  lastSaved,
}: {
  total: number
  dirty: boolean
  saveEnabled: boolean
  locked: boolean
  onSave: () => void
  onReset: () => void
  lastSaved: string
}) {
  const shown = Math.min(total, PAGE_SIZE)
  return (
    <div className="w-full pl-[44px] flex flex-col mb-6 bg-[#F4F6F8]">
      {/* Row B1 — filter breadcrumb + save-state */}
      <div className="flex justify-between items-center h-[36px] border-b border-slate-100 pr-2">
        <div className="flex items-center space-x-[8px]">
          <span className="text-[11px] font-sans text-slate-400">Filter:</span>
          <span className="bg-white border border-[#0891B2] text-[#0891B2] px-[8px] py-[2px] rounded-[4px] text-[11px] font-mono flex items-center h-[20px]">
            @expenses:food
            <span className="text-[#0891B2] ml-1">×</span>
          </span>
          <span className="text-[11px] font-mono text-slate-300">·</span>
          <span className="bg-white border border-slate-200 text-slate-700 px-[8px] py-[2px] rounded-[4px] text-[11px] font-mono flex items-center h-[20px]">
            Apr 2026
            <span className="text-slate-400 ml-1">⌄</span>
          </span>
          <span className="text-[11px] font-mono text-slate-300">·</span>
          <span className="bg-white border border-slate-200 text-slate-700 px-[8px] py-[2px] rounded-[4px] text-[11px] font-mono flex items-center h-[20px]">
            #cashback
            <span className="text-slate-400 ml-1">×</span>
          </span>
          <span className="text-[11px] font-mono text-slate-300">·</span>
          <span className="border border-dashed border-slate-300 text-slate-500 px-[8px] py-[2px] rounded-[4px] text-[11px] font-mono flex items-center h-[20px]">
            + Filter
          </span>
          <span className="text-[11px] font-mono text-slate-300">·</span>
          <span className="text-[11px] font-mono text-slate-500 ml-[6px]">
            {shown} of {total} txns
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <div
            className="w-[6px] h-[6px] rounded-full"
            style={{ background: dirty ? '#F59E0B' : '#14B8A6' }}
          />
          <div className="text-[11px] font-mono">
            <span className="text-slate-700 font-medium">
              {dirty ? 'unsaved edits' : 'all changes saved'}
            </span>{' '}
            <span className="text-slate-400">· last saved {lastSaved}</span>
          </div>
        </div>
      </div>

      {/* Row B2 — cheat strip + search + reset/save */}
      <div className="flex items-center justify-between h-[36px] pr-2">
        <div className="flex items-center text-[10px] font-mono text-slate-400">
          <span className="text-slate-600 font-bold">⌘S</span>
          <span className="ml-1">save</span>
          <span className="text-slate-300 mx-2">·</span>
          <span className="text-slate-600 font-bold">⌘K</span>
          <span className="ml-1">search</span>
          <span className="text-slate-300 mx-2">·</span>
          <span className="text-slate-600 font-bold">⌘J</span>
          <span className="ml-1">ask AI</span>
          <span className="text-slate-300 mx-2">·</span>
          <span className="text-slate-600 font-bold">/</span>
          <span className="ml-1">cmds</span>
        </div>
        <div className="flex items-center justify-end space-x-[6px]">
          <div className="relative h-[28px] bg-white border border-slate-200 rounded-[4px] flex items-center">
            <Search className="absolute left-2 w-[14px] h-[14px] text-slate-400" strokeWidth={1.5} />
            <input
              className="w-[200px] h-full bg-transparent border-0 text-[12px] font-mono pl-8 pr-10 focus:ring-0 placeholder:text-slate-400"
              placeholder="search txns…"
              type="text"
            />
            <span className="absolute right-2 text-[10px] font-mono text-slate-500 bg-slate-100 px-1 rounded">
              ⌘K
            </span>
          </div>
          <button className="h-[28px] bg-transparent border border-transparent rounded-[4px] px-[12px] flex items-center hover:bg-slate-50 transition-colors">
            <Sparkles className="text-slate-500 w-[14px] h-[14px]" strokeWidth={1.5} />
            <span className="ml-[6px] text-[11px] font-mono text-slate-600">Ask AI</span>
            <span className="ml-[6px] text-[10px] font-mono text-slate-500 bg-slate-100 px-1 rounded">
              ⌘J
            </span>
          </button>
          <button
            onClick={onReset}
            disabled={!dirty || locked}
            className="h-[28px] bg-transparent text-slate-600 border border-transparent rounded-[4px] px-[12px] text-[11px] font-mono hover:bg-slate-50 transition-colors flex items-center disabled:opacity-40 disabled:cursor-default"
          >
            Reset
          </button>
          <button
            onClick={onSave}
            disabled={!saveEnabled || locked}
            className="h-[28px] bg-[#0891B2] text-white rounded-[4px] px-[12px] text-[11px] font-mono hover:opacity-90 transition-opacity flex items-center disabled:opacity-40 disabled:cursor-default"
          >
            Save
            <span className="ml-[6px] text-[10px] font-mono text-[#0891B2] bg-white px-1 rounded font-bold">
              ⌘S
            </span>
          </button>
          <button className="h-[28px] w-[28px] flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-[4px]">
            <MoreHorizontal className="w-[14px] h-[14px]" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  )
}

function Pager({
  page,
  totalPages,
  total,
  onPage,
  locked,
}: {
  page: number
  totalPages: number
  total: number
  onPage: (p: number) => void
  locked: boolean
}) {
  const prevDisabled = locked || page <= 1
  const nextDisabled = locked || page >= totalPages
  const shown = Math.min(total, PAGE_SIZE)
  return (
    <div className="flex justify-center mt-8 w-full">
      <div className="h-[48px] flex items-center justify-between bg-white border border-slate-200 rounded-[6px] px-4 w-[380px]">
        <button
          onClick={() => onPage(page - 1)}
          disabled={prevDisabled}
          className="text-slate-600 hover:bg-slate-50 border border-slate-200 bg-white px-3 py-1.5 rounded-[4px] flex items-center text-[12px] font-mono transition-colors disabled:text-slate-300 disabled:border-slate-100 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="w-[14px] h-[14px] mr-1" strokeWidth={1.5} /> Prev
        </button>
        <div className="font-mono text-[11px]">
          <span className="text-navy-900 font-medium">
            Page {page} of {Math.max(1, totalPages)}
          </span>
          <span className="text-slate-400 mx-1">·</span>
          <span className="text-slate-500">
            {shown} of {total} txns
          </span>
        </div>
        <button
          onClick={() => onPage(page + 1)}
          disabled={nextDisabled}
          className="text-slate-600 hover:bg-slate-50 border border-slate-200 bg-white px-3 py-1.5 rounded-[4px] flex items-center text-[12px] font-mono transition-colors disabled:text-slate-300 disabled:border-slate-100 disabled:hover:bg-transparent"
        >
          Next <ChevronRight className="w-[14px] h-[14px] ml-1" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}

export function LedgerNewView(_: { email: string }) {
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
  const [lastSaved, setLastSaved] = useState<string>('—')
  const saving = saveStatus === 'saving'
  const locked = saving

  async function onSave() {
    if (saveStatus === 'saving') return
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
      const now = new Date()
      setLastSaved(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      )
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
      setBufferState({ kind: 'clean' })
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
    <div className="min-h-screen flex flex-col bg-[#F4F6F8] text-navy-900 font-sans">
      <TopNav />
      <main className="w-full max-w-[960px] flex-1 flex flex-col pt-6 pb-12 mx-auto">
        <ChromeRow
          total={state.total}
          dirty={dirty}
          saveEnabled={saveEnabled}
          locked={locked}
          onSave={onSave}
          onReset={onRevert}
          lastSaved={lastSaved}
        />

        {/* Editor surface (CodeMirror renders cards + gutter inside) */}
        <div className="bg-[#F4F6F8] min-h-[400px] relative">
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
        </div>

        <Pager
          page={page}
          totalPages={totalPages}
          total={state.total}
          onPage={setPage}
          locked={pageLocked}
        />

        {saveErrorMsg && (
          <div className="mt-3 mx-auto text-[11px] font-mono text-red-600">
            {saveErrorMsg}
          </div>
        )}
      </main>
    </div>
  )
}
