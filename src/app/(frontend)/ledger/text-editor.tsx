'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Transaction } from '@/durable/ledger-types'

const MAX_BLOCKS = 10
const ID_COMMENT_RE = /^;\s*id:\s*(\d+)\s*$/i

type Snapshot = { id: number; expected_updated_at: number; raw_text: string }
type Block = { id: number | null; raw_text: string }
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
  return rows.map((r) => `; id: ${r.id}\n${r.raw_text.trim()}`).join('\n\n') + '\n'
}

function parseBuffer(s: string): { blocks: Block[]; errors: string[] } {
  const blocks: Block[] = []
  const errors: string[] = []
  const chunks = s.replace(/\r\n/g, '\n').split(/\n\s*\n+/)
  for (const chunk of chunks) {
    const trimmed = chunk.trim()
    if (!trimmed) continue
    const lines = trimmed.split('\n')
    const m = ID_COMMENT_RE.exec(lines[0].trim())
    if (m) {
      const id = Number(m[1])
      const body = lines.slice(1).join('\n').trim()
      if (!body) {
        errors.push(`Block for id ${id} has no body.`)
        continue
      }
      blocks.push({ id, raw_text: body })
    } else {
      blocks.push({ id: null, raw_text: trimmed })
    }
  }
  return { blocks, errors }
}

function planBatch(
  snapshots: Snapshot[],
  blocks: Block[],
): { plan: BatchPlan; errors: string[] } {
  const byId = new Map(snapshots.map((s) => [s.id, s]))
  const seen = new Set<number>()
  const plan: BatchPlan = { updates: [], creates: [], deletes: [] }
  const errors: string[] = []
  for (const b of blocks) {
    if (b.id == null) {
      plan.creates.push({ raw_text: b.raw_text })
      continue
    }
    const snap = byId.get(b.id)
    if (!snap) {
      errors.push(`Unknown id ${b.id} in buffer. Remove \`; id: ${b.id}\` to create new.`)
      continue
    }
    if (seen.has(b.id)) {
      errors.push(`Duplicate id ${b.id} in buffer.`)
      continue
    }
    seen.add(b.id)
    if (b.raw_text.trim() === snap.raw_text.trim()) continue
    plan.updates.push({
      id: b.id,
      raw_text: b.raw_text,
      expected_updated_at: snap.expected_updated_at,
    })
  }
  for (const s of snapshots) {
    if (!seen.has(s.id)) {
      plan.deletes.push({ id: s.id, expected_updated_at: s.expected_updated_at })
    }
  }
  return { plan, errors }
}

function planIsEmpty(p: BatchPlan): boolean {
  return p.updates.length === 0 && p.creates.length === 0 && p.deletes.length === 0
}

type BatchErrorEntry = { section: string; index: number; errors: string[] }
type BatchConflictEntry = { section: string; index: number; id: number }

export function TextEditor({
  rows,
  total,
  onReload,
}: {
  rows: Transaction[]
  total: number
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

  if (total > MAX_BLOCKS) {
    return (
      <div className="py-24 text-center font-serif italic text-muted text-sm">
        Text mode supports up to {MAX_BLOCKS} transactions per edit. Narrow the search to continue —
        currently {total}.
      </div>
    )
  }

  const dirty = buffer !== baseline

  async function onSave() {
    const { blocks, errors: parseErrors } = parseBuffer(buffer)
    if (parseErrors.length > 0) {
      setStatus({ kind: 'error', messages: parseErrors })
      return
    }
    if (blocks.length > MAX_BLOCKS) {
      setStatus({
        kind: 'error',
        messages: [`At most ${MAX_BLOCKS} transactions per save; buffer has ${blocks.length}.`],
      })
      return
    }
    const { plan, errors: planErrors } = planBatch(snapshots, blocks)
    if (planErrors.length > 0) {
      setStatus({ kind: 'error', messages: planErrors })
      return
    }
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
    <div className="flex flex-col gap-3 pb-24">
      <textarea
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        spellCheck={false}
        className="w-full min-h-[480px] font-mono text-[12px] leading-[1.55] text-[#2A2520] bg-white border border-black/10 rounded-[12px] p-5 focus:outline-none focus:ring-1 focus:ring-[#0A2540] whitespace-pre"
      />
      <div className="flex items-start justify-between gap-6">
        <StatusPanel status={status} />
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onRevert}
            disabled={!dirty || status.kind === 'saving'}
            className="px-4 py-1.5 rounded-full border border-black/10 text-sm font-medium text-muted hover:text-ink disabled:opacity-40"
          >
            Revert
          </button>
          <button
            onClick={onSave}
            disabled={!dirty || status.kind === 'saving'}
            className="px-4 py-1.5 rounded-full bg-[#0A2540] text-white text-sm font-medium disabled:opacity-40"
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
    return <span className="text-sm font-mono text-[#2A7D4F]">Saved.</span>
  }
  if (status.kind === 'conflict') {
    return (
      <div className="text-sm font-mono text-[#ba1a1a] leading-relaxed">
        Conflict on id {status.ids.join(', ')} — someone else changed these. Revert to reload and
        retry.
      </div>
    )
  }
  return (
    <ul className="text-sm font-mono text-[#ba1a1a] list-disc pl-5 leading-relaxed">
      {status.messages.map((m, i) => (
        <li key={i}>{m}</li>
      ))}
    </ul>
  )
}
