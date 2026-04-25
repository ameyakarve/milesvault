'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Transaction } from '@/durable/ledger-types'
import { format } from '@/lib/beancount/format'
import { type BufferState, evaluateBuffer } from './buffer-state'
import { composeBuffer } from './editor'
import { setAiSnapshots } from './editor-ai-widget'
import type { LedgerEditorHandle } from './ledger-editor'
import { FilterBar } from './ledger-filter-bar'
import { HelpButton } from './ledger-help'
import { TextPane } from './ledger-panes'
import { buildSnapshots, PAGE_SIZE, useTransactions } from './use-transactions'

function PaginationPill({
  page,
  totalPages,
  pageRows,
  total,
  onPage,
  locked = false,
  lockTitle,
}: {
  page: number
  totalPages: number
  pageRows: number
  total: number
  onPage: (p: number) => void
  locked?: boolean
  lockTitle?: string
}) {
  const prevDisabled = locked || page <= 1
  const nextDisabled = locked || page >= totalPages
  const prevTitle = locked ? lockTitle : page <= 1 ? undefined : 'previous page'
  const nextTitle = locked ? lockTitle : page >= totalPages ? undefined : 'next page'
  const enabled =
    'text-slate-600 hover:bg-slate-50 border border-transparent transition-colors'
  const disabled = 'text-slate-300 border border-slate-100 bg-slate-50/50 cursor-default'
  const base =
    'px-3 py-1.5 rounded-[4px] flex items-center text-[12px] font-mono'
  return (
    <div className="flex justify-center my-6 shrink-0">
      <div className="h-12 flex items-center justify-between bg-white border border-slate-200 rounded-[6px] px-4 w-[380px] shadow-sm">
        <button
          type="button"
          aria-label="previous page"
          title={prevTitle}
          disabled={prevDisabled}
          onClick={() => onPage(page - 1)}
          className={`${base} ${prevDisabled ? disabled : enabled}`}
        >
          <ChevronLeft size={14} strokeWidth={1.5} className="mr-1" />
          Prev
        </button>
        <div className="font-mono text-[11px]">
          <span className="text-slate-700 font-medium">
            Page {page} of {Math.max(1, totalPages)}
          </span>
          <span className="text-slate-400 mx-1">·</span>
          <span className="text-slate-500">
            {pageRows} of {total} txns
          </span>
        </div>
        <button
          type="button"
          aria-label="next page"
          title={nextTitle}
          disabled={nextDisabled}
          onClick={() => onPage(page + 1)}
          className={`${base} ${nextDisabled ? disabled : enabled}`}
        >
          Next
          <ChevronRight size={14} strokeWidth={1.5} className="ml-1" />
        </button>
      </div>
    </div>
  )
}

export function LedgerView({ email }: { email: string }) {
  const avatarInitial = (email?.[0] ?? 'a').toUpperCase()
  const [page, setPage] = useState(1)
  const state = useTransactions(page)
  const snapshots = useMemo(() => buildSnapshots(state.rows), [state.rows])
  const baseline = useMemo(
    () => composeBuffer(state.rows.map((r) => r.raw_text)),
    [state.rows],
  )
  const [buffer, setBuffer] = useState(baseline)
  useEffect(() => {
    setBuffer(baseline)
    editorRef.current?.resetCursor()
  }, [baseline])
  useEffect(() => {
    editorRef.current?.getView()?.dispatch({ effects: setAiSnapshots.of(snapshots) })
  }, [snapshots])

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'conflict' | 'error'>('idle')
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const saving = saveStatus === 'saving'
  const locked = saving

  const editorRef = useRef<LedgerEditorHandle | null>(null)

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
      setLastSavedAt(new Date())
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
  const pageLockTitle = saving
    ? 'paging disabled (saving)'
    : dirty
      ? 'save or revert first'
      : undefined

  return (
    <div className="w-screen h-screen flex flex-col bg-scandi-backdrop text-navy-700 overflow-hidden font-sans">
      <header className="w-full bg-white border-b border-slate-200 shrink-0 z-20">
        <div className="flex justify-between items-center w-full px-6 py-3 max-w-[960px] mx-auto">
          <div className="flex items-center gap-6">
            <span className="text-[13px] font-black tracking-tighter text-navy-700 uppercase">
              milesvault
            </span>
            <nav className="flex items-center gap-6">
              <a
                href="#"
                className="text-[12px] uppercase tracking-wider font-bold text-scandi-accent border-b-2 border-scandi-accent pb-1"
              >
                Ledger
              </a>
              <a
                href="#"
                className="text-[12px] uppercase tracking-wider font-bold text-slate-500 pb-1 hover:text-navy-700 transition-colors"
              >
                Dashboard
              </a>
              <a
                href="#"
                className="text-[12px] uppercase tracking-wider font-bold text-slate-500 pb-1 hover:text-navy-700 transition-colors"
              >
                Insights
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <HelpButton />
            <div
              className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center"
              title={email}
            >
              <span className="text-[11px] font-medium text-slate-600">{avatarInitial}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col bg-scandi-backdrop overflow-hidden min-h-0 w-full max-w-[960px] mx-auto pt-6">
        <FilterBar
          total={state.total}
          pageRows={state.rows.length}
          saveStatus={saveStatus}
          bufferState={bufferState}
          saveErrorMsg={saveErrorMsg}
          saving={saving}
          dirty={dirty}
          saveEnabled={saveEnabled}
          locked={locked}
          lastSavedAt={lastSavedAt}
          onSave={onSave}
          onRevert={onRevert}
        />
        <section className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden mt-4">
          <div className="flex-1 min-h-0 bg-white flex flex-col overflow-hidden relative">
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
        </section>
        <PaginationPill
          page={page}
          totalPages={totalPages}
          pageRows={state.rows.length}
          total={state.total}
          onPage={setPage}
          locked={pageLocked}
          lockTitle={pageLockTitle}
        />
      </main>
    </div>
  )
}
