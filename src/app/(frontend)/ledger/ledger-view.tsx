'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Filter,
  Plus,
  RotateCcw,
  Save,
} from 'lucide-react'
import type { Transaction } from '@/durable/ledger-types'
import { format } from '@/lib/beancount/format'
import { type BufferState, evaluateBuffer } from './buffer-state'
import { composeBuffer } from './editor'
import { setAiSnapshots } from './editor-ai-widget'
import { ChromeIconButton, PaneCap, PaneLabel } from './ledger-chrome'
import type { LedgerEditorHandle } from './ledger-editor'
import { TextPane } from './ledger-panes'
import { SavePill } from './save-status'
import { buildSnapshots, PAGE_SIZE, useTransactions } from './use-transactions'

function PaginationStrip({
  page,
  totalPages,
  onPage,
  locked = false,
  lockTitle,
}: {
  page: number
  totalPages: number
  onPage: (p: number) => void
  locked?: boolean
  lockTitle?: string
}) {
  const prevDisabled = locked || page <= 1
  const nextDisabled = locked || page >= totalPages
  const prevTitle = locked ? lockTitle : page <= 1 ? undefined : 'previous page'
  const nextTitle = locked ? lockTitle : page >= totalPages ? undefined : 'next page'
  const btnBase = 'w-[20px] h-[20px] flex items-center justify-center rounded-[4px]'
  const btnEnabled = `${btnBase} text-slate-600 hover:bg-slate-300 hover:text-navy-700 transition-colors`
  const btnDisabled = `${btnBase} text-slate-500 opacity-30 cursor-default`
  return (
    <div className="h-[32px] bg-scandi-chrome flex items-center shrink-0 w-full relative">
      <div className="flex-1 flex items-center justify-center gap-2">
        <button
          type="button"
          aria-label="previous page"
          title={prevTitle}
          disabled={prevDisabled}
          onClick={() => onPage(page - 1)}
          className={prevDisabled ? btnDisabled : btnEnabled}
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
        </button>
        <span className="font-mono text-[10px] text-navy-700">
          page {page} of {Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          aria-label="next page"
          title={nextTitle}
          disabled={nextDisabled}
          onClick={() => onPage(page + 1)}
          className={nextDisabled ? btnDisabled : btnEnabled}
        >
          <ChevronRight size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}

export function LedgerView(_: { email: string }) {
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
  const saving = saveStatus === 'saving'
  const locked = saving
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const handle = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(handle)
  }, [copied])
  async function onCopyBuffer() {
    try {
      await navigator.clipboard.writeText(buffer)
      setCopied(true)
    } catch {}
  }

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
    <div className="w-screen h-screen flex flex-col bg-white text-navy-700 overflow-hidden font-sans">
      <header className="h-[32px] px-4 flex items-center bg-white shrink-0 z-20 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="font-sans font-medium text-navy-700 text-[13px]">milesvault</span>
          <span className="font-sans font-normal text-slate-500 text-[12px]">/ ledger</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col bg-scandi-backdrop border-y border-y-scandi-backdrop overflow-hidden min-h-0">
        <section className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          <PaneCap className="justify-between">
            <PaneLabel>EDITOR</PaneLabel>
            <div className="flex items-center">
              <ChromeIconButton icon={Plus} title="new entry" />
              <ChromeIconButton
                icon={Save}
                title={
                  saving
                    ? 'saving…'
                    : bufferState.kind === 'dirty'
                      ? 'save (fix parse errors first)'
                      : bufferState.kind === 'staged' && !bufferState.validated
                        ? 'save (fix validation errors first)'
                        : 'save · ⌘S'
                }
                dirty={dirty}
                disabled={!saveEnabled || locked}
                onClick={onSave}
              />
              <ChromeIconButton
                icon={RotateCcw}
                title={saving ? 'revert (saving)' : 'revert'}
                disabled={!dirty || locked}
                onClick={onRevert}
              />
              <SavePill
                saveStatus={saveStatus}
                bufferState={bufferState}
                errorMsg={saveErrorMsg}
              />
              <div className="h-[16px] w-px bg-slate-400 mx-2" />
              <ChromeIconButton
                icon={Filter}
                title={
                  saving
                    ? 'filter (saving)'
                    : dirty
                      ? 'filter (save or revert first)'
                      : 'filter'
                }
                disabled={pageLocked}
              />
              <ChromeIconButton
                icon={Copy}
                title={copied ? 'copied' : 'copy buffer'}
                onClick={onCopyBuffer}
                active={copied}
              />
            </div>
          </PaneCap>
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
      </main>

      <PaginationStrip
        page={page}
        totalPages={totalPages}
        onPage={setPage}
        locked={pageLocked}
        lockTitle={pageLockTitle}
      />
    </div>
  )
}
