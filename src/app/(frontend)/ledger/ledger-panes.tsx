'use client'

import type { Ref } from 'react'
import { LedgerEditor, type LedgerEditorHandle } from './ledger-editor'

export type FetchStatus = 'loading' | 'idle' | 'error'
export type Entry = { text: string; snapshotId: number | null }

function PaneStatus({
  status,
  errorMsg,
}: {
  status: FetchStatus
  errorMsg: string | null
}) {
  const base = 'flex-1 flex items-center justify-center text-[11px] font-mono'
  if (status === 'loading') return <div className={`${base} text-slate-400`}>loading…</div>
  return <div className={`${base} text-error`}>failed to load — {errorMsg}</div>
}

export function TextPane({
  status,
  errorMsg,
  buffer,
  baseline,
  onBufferChange,
  onCursorChange,
  onSave,
  readOnly,
  editorRef,
}: {
  status: FetchStatus
  errorMsg: string | null
  buffer: string
  baseline: string
  onBufferChange: (v: string) => void
  onCursorChange: (pos: number) => void
  onSave?: () => void
  readOnly?: boolean
  editorRef?: Ref<LedgerEditorHandle>
}) {
  if (status !== 'idle') return <PaneStatus status={status} errorMsg={errorMsg} />
  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <LedgerEditor
        ref={editorRef}
        className="h-full"
        value={buffer}
        baseline={baseline}
        onChange={onBufferChange}
        onCursorChange={onCursorChange}
        onSave={onSave}
        readOnly={readOnly}
      />
    </div>
  )
}
