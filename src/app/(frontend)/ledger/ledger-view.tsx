'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Filter,
  HelpCircle,
  Plus,
  RotateCcw,
  Save,
  Wallet,
  X,
} from 'lucide-react'
import type { Transaction as BeanTxn } from 'beancount'
import { parse as parseBean } from 'beancount'
import type { Transaction } from '@/durable/ledger-types'
import { splitEntries } from '@/lib/beancount/extract'
import { format } from '@/lib/beancount/format'
import { type BufferState, evaluateBuffer } from './buffer-state'
import { composeBuffer } from './editor'
import { ChromeIconButton, PaneLabel } from './ledger-chrome'
import { CardsList, type Entry, type FetchStatus, TextPane } from './ledger-panes'
import { applyProposal, type Op } from './propose'
import { SavePill } from './save-status'
import { ThinkPane } from './think-pane'

const PAGE_SIZE = 10

type ParsedTxn = { bean: BeanTxn; raw: string }

function safeParse(raw: string): ParsedTxn | null {
  try {
    const result = parseBean(raw)
    const bean = result.transactions[0]
    if (!bean) return null
    return { bean, raw }
  } catch {
    return null
  }
}

type Snapshot = { id: number; raw_text: string; expected_updated_at: number }

function buildSnapshots(rows: Transaction[]): Snapshot[] {
  return rows.map((r) => ({
    id: r.id,
    raw_text: r.raw_text.trim(),
    expected_updated_at: r.updated_at,
  }))
}

function deriveEntries(buffer: string, snapshots: Snapshot[]): Entry[] {
  const parts = splitEntries(buffer).map((e) => e.text.trim()).filter((t) => t.length > 0)
  const byBody = new Map<string, Snapshot[]>()
  for (const s of snapshots) {
    const arr = byBody.get(s.raw_text) ?? []
    arr.push(s)
    byBody.set(s.raw_text, arr)
  }
  const used = new Set<number>()
  const out: Entry[] = []
  const resolved: (Snapshot | null)[] = parts.map((text) => {
    const candidates = byBody.get(text) ?? []
    const m = candidates.find((c) => !used.has(c.id))
    if (m) {
      used.add(m.id)
      return m
    }
    return null
  })
  const unusedInOrder = snapshots.filter((s) => !used.has(s.id))
  let cursor = 0
  for (let i = 0; i < parts.length; i++) {
    let snap = resolved[i]
    if (!snap && cursor < unusedInOrder.length) {
      snap = unusedInOrder[cursor++]
    }
    out.push({ text: parts[i], snapshotId: snap ? snap.id : null })
  }
  return out
}


type FetchState = {
  status: FetchStatus
  rows: Transaction[]
  total: number
  errorMsg: string | null
}

function useTransactions(
  page: number,
): FetchState & {
  replaceRows: (rows: Transaction[]) => void
} {
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
  return (
    <div className="h-[32px] bg-[#F1F5F9] border-t border-b border-[#E2E8F0] flex items-center shrink-0 w-full relative">
      <div className="flex-1 flex items-center justify-center gap-2">
        <button
          type="button"
          aria-label="previous page"
          title={prevTitle}
          disabled={prevDisabled}
          onClick={() => onPage(page - 1)}
          className={
            prevDisabled
              ? 'w-[20px] h-[20px] flex items-center justify-center rounded-[4px] text-slate-500 opacity-30 cursor-default'
              : 'w-[20px] h-[20px] flex items-center justify-center rounded-[4px] text-slate-500 hover:bg-[#E2E8F0] hover:text-[#0F172A] transition-colors'
          }
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
          className={
            nextDisabled
              ? 'w-[20px] h-[20px] flex items-center justify-center rounded-[4px] text-slate-500 opacity-30 cursor-default'
              : 'w-[20px] h-[20px] flex items-center justify-center rounded-[4px] text-slate-500 hover:bg-[#E2E8F0] hover:text-[#0F172A] transition-colors'
          }
        >
          <ChevronRight size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}

function allEntriesParse(entries: Entry[]): boolean {
  if (entries.length === 0) return true
  return entries.every((e) => safeParse(e.text) !== null)
}

export function LedgerView({ email }: { email: string }) {
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
  }, [baseline])

  const liveEntries = useMemo(() => deriveEntries(buffer, snapshots), [buffer, snapshots])
  const [cardEntries, setCardEntries] = useState<Entry[]>(liveEntries)
  useEffect(() => {
    if (allEntriesParse(liveEntries)) setCardEntries(liveEntries)
  }, [liveEntries])

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'conflict' | 'error'>('idle')
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const saving = saveStatus === 'saving'
  const locked = aiBusy || saving
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

  async function onSave() {
    if (saveStatus === 'saving') return
    const verdict = evaluateBuffer(buffer, baseline)
    if (verdict.kind !== 'staged' || !verdict.validated) {
      setBufferState(verdict)
      return
    }
    const formatted = format(buffer)
    if (formatted !== buffer) setBuffer(formatted)
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

  const [cursorPos, setCursorPos] = useState(0)
  const activeIdx = useMemo(() => {
    const parts = splitEntries(buffer)
    const lines = buffer.split('\n')
    const lineOffsets: number[] = [0]
    for (const l of lines) lineOffsets.push(lineOffsets[lineOffsets.length - 1] + l.length + 1)
    for (let i = 0; i < parts.length; i++) {
      const start = lineOffsets[parts[i].startLine]
      const end = lineOffsets[parts[i].endLine + 1]
      if (cursorPos < start || cursorPos >= end) continue
      const live = liveEntries[i]
      if (!live) return null
      if (live.snapshotId !== null) {
        const found = cardEntries.findIndex((e) => e.snapshotId === live.snapshotId)
        if (found !== -1) return found
      }
      return i < cardEntries.length ? i : null
    }
    return null
  }, [buffer, cursorPos, liveEntries, cardEntries])

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
  const pageLockTitle = saving
    ? 'paging disabled (saving)'
    : aiBusy
      ? 'paging disabled (assistant working)'
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

      <div className="h-[40px] px-4 flex justify-between items-center bg-white border-b border-slate-200 shrink-0 z-10">
        <div className="flex items-center">
          <ChromeIconButton icon={Plus} title="new entry" />
          <ChromeIconButton
            icon={Save}
            title={
              saving
                ? 'saving…'
                : aiBusy
                  ? 'save (assistant working)'
                  : bufferState.kind === 'dirty'
                    ? 'save (fix parse errors first)'
                    : bufferState.kind === 'staged' && !bufferState.validated
                      ? 'save (fix validation errors first)'
                      : 'save'
            }
            dirty={dirty}
            disabled={!saveEnabled || locked}
            onClick={onSave}
          />
          <ChromeIconButton
            icon={RotateCcw}
            title={
              saving
                ? 'revert (saving)'
                : aiBusy
                  ? 'revert (assistant working)'
                  : 'revert'
            }
            disabled={!dirty || locked}
            onClick={onRevert}
          />
          <SavePill
            saveStatus={saveStatus}
            bufferState={bufferState}
            errorMsg={saveErrorMsg}
          />
          <div className="h-[16px] w-px bg-slate-200 mx-3" />
          <div className="flex items-center gap-1">
            <ChromeIconButton
              icon={Filter}
              title={
                saving
                  ? 'filter (saving)'
                  : aiBusy
                    ? 'filter (assistant working)'
                    : dirty
                      ? 'filter (save or revert first)'
                      : 'filter'
              }
              disabled={pageLocked}
            />
            <div className="flex items-center gap-1 pl-2 pr-1 h-[24px] bg-slate-100 text-[11px] font-mono text-navy-700 rounded-[4px]">
              swiggy · oct 2025
              <button
                type="button"
                title={
                  saving
                    ? 'clear filter (saving)'
                    : aiBusy
                      ? 'clear filter (assistant working)'
                      : dirty
                        ? 'clear filter (save or revert first)'
                        : 'clear filter'
                }
                disabled={pageLocked}
                className="w-[16px] h-[16px] flex items-center justify-center hover:bg-slate-200 rounded-[2px] transition-colors disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <X size={12} className="text-slate-600" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChromeIconButton icon={HelpCircle} title="help" />
        </div>
      </div>

      <main className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-[3] flex flex-col min-w-0 border-r border-slate-200">
          <div className="flex w-full shrink-0">
            <div className="flex-[1] h-[28px] px-3 flex items-center border-b border-slate-200 border-r bg-white shrink-0">
              <PaneLabel>LEDGER</PaneLabel>
            </div>
            <div className="flex-[2] h-[28px] px-3 flex items-center justify-between border-b border-slate-200 bg-white shrink-0">
              <PaneLabel>EDITOR</PaneLabel>
              <button
                type="button"
                title={copied ? 'copied' : 'copy buffer'}
                onClick={onCopyBuffer}
                className={`w-[20px] h-[20px] flex items-center justify-center hover:bg-[#F1F5F9] transition-colors rounded-[4px] mr-[12px] ${
                  copied ? 'text-emerald-600' : 'text-slate-500 hover:text-navy-700'
                }`}
              >
                <Copy size={14} strokeWidth={1.5} />
              </button>
            </div>
          </div>
          <div className="flex flex-1 min-h-0">
            <section className="flex-[1] min-w-0 bg-white flex flex-col relative overflow-hidden border-r border-slate-200">
              <CardsList
                status={state.status}
                errorMsg={state.errorMsg}
                entries={cardEntries}
                activeIdx={activeIdx}
              />
              <div className="absolute -bottom-6 -right-6 text-navy-600 opacity-[0.03] select-none pointer-events-none z-0">
                <Wallet size={180} strokeWidth={1.5} />
              </div>
            </section>
            <section className="flex-[2] min-w-0 bg-white flex flex-col overflow-hidden relative">
              <TextPane
                status={state.status}
                errorMsg={state.errorMsg}
                buffer={buffer}
                baseline={baseline}
                onBufferChange={setBuffer}
                onCursorChange={setCursorPos}
                readOnly={locked}
              />
            </section>
          </div>
        </div>

        <section className="flex-1 min-w-0 flex flex-col">
          <ThinkPane
            email={email}
            buffer={buffer}
            snapshots={snapshots}
            saving={saving}
            onAiBusyChange={setAiBusy}
            onPropose={(ops: readonly Op[]) => {
              const res = applyProposal(buffer, snapshots, ops)
              if (res.ok === true) {
                setBuffer(res.buffer)
                return { ok: true }
              }
              return { ok: false, reason: res.reason }
            }}
          />
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
