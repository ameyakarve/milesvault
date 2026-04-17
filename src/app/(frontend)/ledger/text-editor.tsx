'use client'

import { useEffect, useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import type { Transaction } from '@/durable/ledger-types'
import { splitEntries } from '@/lib/beancount/extract'
import { beancountExtensions } from './beancount-editor'

const MAX_SAVE_ENTRIES = 50

type Snapshot = { id: number; expected_updated_at: number; raw_text: string }
type BatchPlan = {
  updates: { id: number; raw_text: string; expected_updated_at: number }[]
  creates: { raw_text: string }[]
  deletes: { id: number; expected_updated_at: number }[]
}

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; messages: string[] }
  | { kind: 'conflict'; ids: number[] }

function composeBuffer(rows: Transaction[]): string {
  return rows.map((r) => r.raw_text.trim()).join('\n\n') + '\n'
}

function parseBuffer(s: string): string[] {
  const normalized = s.replace(/\r\n/g, '\n')
  return splitEntries(normalized).map((e) => e.text.trim())
}

function planBatch(snapshots: Snapshot[], entries: string[]): BatchPlan {
  const plan: BatchPlan = { updates: [], creates: [], deletes: [] }
  const usedSnapshotIds = new Set<number>()
  const unmatchedEntries: string[] = []

  const snapsByBody = new Map<string, Snapshot[]>()
  for (const s of snapshots) {
    const key = s.raw_text.trim()
    const arr = snapsByBody.get(key) ?? []
    arr.push(s)
    snapsByBody.set(key, arr)
  }

  for (const text of entries) {
    const candidates = snapsByBody.get(text) ?? []
    const matched = candidates.find((c) => !usedSnapshotIds.has(c.id))
    if (matched) {
      usedSnapshotIds.add(matched.id)
    } else {
      unmatchedEntries.push(text)
    }
  }

  const unmatchedSnapshots = snapshots.filter((s) => !usedSnapshotIds.has(s.id))
  const pairCount = Math.min(unmatchedEntries.length, unmatchedSnapshots.length)

  for (let i = 0; i < pairCount; i++) {
    plan.updates.push({
      id: unmatchedSnapshots[i].id,
      raw_text: unmatchedEntries[i],
      expected_updated_at: unmatchedSnapshots[i].expected_updated_at,
    })
  }
  for (let i = pairCount; i < unmatchedEntries.length; i++) {
    plan.creates.push({ raw_text: unmatchedEntries[i] })
  }
  for (let i = pairCount; i < unmatchedSnapshots.length; i++) {
    plan.deletes.push({
      id: unmatchedSnapshots[i].id,
      expected_updated_at: unmatchedSnapshots[i].expected_updated_at,
    })
  }
  return plan
}

function planIsEmpty(p: BatchPlan): boolean {
  return p.updates.length === 0 && p.creates.length === 0 && p.deletes.length === 0
}

type BatchErrorEntry = { section: string; index: number; errors: string[] }
type BatchConflictEntry = { section: string; index: number; id: number }

export function TextEditor({
  rows,
  onReload,
}: {
  rows: Transaction[]
  onReload: () => void
}) {
  const snapshots = useMemo<Snapshot[]>(
    () =>
      rows.map((r) => ({
        id: r.id,
        expected_updated_at: r.updated_at,
        raw_text: r.raw_text,
      })),
    [rows],
  )
  const [buffer, setBuffer] = useState(() => composeBuffer(rows))
  const [baseline, setBaseline] = useState(() => composeBuffer(rows))
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  useEffect(() => {
    const fresh = composeBuffer(rows)
    setBaseline(fresh)
    setBuffer(fresh)
    setStatus({ kind: 'idle' })
  }, [rows])

  const dirty = buffer !== baseline

  async function onSave() {
    const entries = parseBuffer(buffer)
    if (entries.length > MAX_SAVE_ENTRIES) {
      setStatus({
        kind: 'error',
        messages: [
          `At most ${MAX_SAVE_ENTRIES} transactions per save; buffer has ${entries.length}.`,
        ],
      })
      return
    }
    const plan = planBatch(snapshots, entries)
    if (planIsEmpty(plan)) {
      setStatus({ kind: 'error', messages: ['No changes.'] })
      return
    }

    setStatus({ kind: 'saving' })
    try {
      const res = await fetch('/api/ledger/transactions/batch', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(plan),
      })
      if (res.ok) {
        setStatus({ kind: 'saved' })
        onReload()
        return
      }
      if (res.status === 409) {
        const body = (await res.json().catch((): null => null)) as {
          conflicts?: BatchConflictEntry[]
        } | null
        const ids = (body?.conflicts ?? []).map((c) => c.id)
        setStatus({ kind: 'conflict', ids })
        return
      }
      const body = (await res.json().catch((): null => null)) as {
        errors?: BatchErrorEntry[] | string[]
      } | null
      const messages = extractMessages(body, res.status)
      setStatus({ kind: 'error', messages })
    } catch (e) {
      setStatus({ kind: 'error', messages: [(e as Error).message] })
    }
  }

  function onRevert() {
    setBuffer(baseline)
    setStatus({ kind: 'idle' })
  }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex-1 min-h-0 bg-white border border-zinc-200 rounded-[4px] overflow-hidden focus-within:border-[#09090B] focus-within:ring-2 focus-within:ring-[#09090B]">
        <CodeMirror
          className="h-full"
          value={buffer}
          onChange={setBuffer}
          extensions={beancountExtensions}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: false,
            highlightActiveLineGutter: true,
            foldGutter: false,
            autocompletion: false,
            searchKeymap: false,
            bracketMatching: false,
            indentOnInput: false,
          }}
        />
      </div>
      <div className="flex items-start justify-between gap-6 shrink-0">
        <StatusPanel status={status} />
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onRevert}
            disabled={!dirty || status.kind === 'saving'}
            className="h-7 px-3 rounded-[4px] border border-zinc-200 text-[13px] text-zinc-600 hover:text-[#09090B] hover:border-zinc-300 disabled:opacity-40"
          >
            Revert
          </button>
          <button
            onClick={onSave}
            disabled={!dirty || status.kind === 'saving'}
            className="h-7 px-3 rounded-[4px] bg-[#09090B] text-white text-[13px] font-medium disabled:opacity-40"
          >
            {status.kind === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function extractMessages(
  body: { errors?: BatchErrorEntry[] | string[] } | null,
  fallbackStatus: number,
): string[] {
  const errs = body?.errors
  if (!errs || errs.length === 0) return [`HTTP ${fallbackStatus}`]
  if (typeof errs[0] === 'string') return errs as string[]
  const out: string[] = []
  for (const e of errs as BatchErrorEntry[]) {
    for (const m of e.errors) out.push(`${e.section}${e.index >= 0 ? `[${e.index}]` : ''}: ${m}`)
  }
  return out
}

function StatusPanel({ status }: { status: Status }) {
  if (status.kind === 'idle' || status.kind === 'saving') return <div />
  if (status.kind === 'saved') {
    return <span className="font-mono text-[12px] text-emerald-700">✓ saved</span>
  }
  if (status.kind === 'conflict') {
    return (
      <div className="font-mono text-[12px] text-[#b91c1c] leading-[1.5]">
        conflict on id {status.ids.join(', ')} — someone else changed these. revert to reload
        and retry.
      </div>
    )
  }
  return (
    <ul className="font-mono text-[12px] text-[#b91c1c] list-disc pl-5 leading-[1.5]">
      {status.messages.map((m, i) => (
        <li key={i}>{m}</li>
      ))}
    </ul>
  )
}
