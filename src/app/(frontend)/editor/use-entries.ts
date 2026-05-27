import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ledgerClient, isReplaceBufferError } from '@/lib/ledger-client-browser'
import type {
  EntryRef2,
  EntryRow,
  ReplaceBufferResponse,
} from '@/durable/ledger-do'
import type { DirectiveInput, TransactionInput } from '@/durable/ledger-types'
import { serializeJournal } from '@/lib/beancount/ast'
import { isStrictParseErr, parseJournalStrict } from '@/lib/beancount/parse-strict'

export type SaveOutcome =
  | { ok: true }
  | { ok: false; message: string; conflict: boolean }

export function composeBaseline(rows: ReadonlyArray<{ raw_text: string }>): string {
  if (rows.length === 0) return ''
  return rows.map((r) => r.raw_text).join('\n\n') + '\n'
}

function rowsToSnapshots(rows: ReadonlyArray<EntryRow>): EntryRef2[] {
  return rows.map((r) => ({
    kind: r.kind,
    id: r.id,
    expected_updated_at: r.updated_at,
  }))
}

function canonicalizeTxn(t: TransactionInput): string {
  return serializeJournal([t], [], { descending: false }).trimEnd()
}

function canonicalizeDir(d: DirectiveInput): string {
  return serializeJournal([], [d], { descending: false }).trimEnd()
}

// Diff the buffer against rows by canonical text. Server-stored `raw_text`
// is already the canonical form (same serializeJournal call). Multiset
// matching (Map<text, rows[]> + shift) handles duplicates safely. Returns
// null on parse failure so the caller can fall back to whole-buffer replace
// — the server will reject with the same parse_error.
export function diffBuffer(
  rows: ReadonlyArray<EntryRow>,
  buffer: string,
): { knownIds: EntryRef2[]; bufferToSend: string } | null {
  const parsed = parseJournalStrict(buffer)
  if (isStrictParseErr(parsed)) return null

  const baselineByText = new Map<string, EntryRow[]>()
  for (const r of rows) {
    const arr = baselineByText.get(r.raw_text)
    if (arr) arr.push(r)
    else baselineByText.set(r.raw_text, [r])
  }

  const bufferOnly: string[] = []
  for (const t of parsed.transactions) {
    const canon = canonicalizeTxn(t)
    const queue = baselineByText.get(canon)
    if (queue && queue.length > 0) queue.shift()
    else bufferOnly.push(canon)
  }
  for (const d of parsed.directives) {
    const canon = canonicalizeDir(d)
    const queue = baselineByText.get(canon)
    if (queue && queue.length > 0) queue.shift()
    else bufferOnly.push(canon)
  }

  const knownIds: EntryRef2[] = []
  for (const queue of baselineByText.values()) {
    for (const r of queue) {
      knownIds.push({
        kind: r.kind,
        id: r.id,
        expected_updated_at: r.updated_at,
      })
    }
  }

  const bufferToSend = bufferOnly.length > 0 ? bufferOnly.join('\n\n') + '\n' : ''
  return { knownIds, bufferToSend }
}

// Loads /api/ledger/journal/entries and tracks rows + baseline + buffer
// state. CodeMirror controls `buffer`; on save we send the current snapshots
// (knownIds) and the buffer string. A 409 transparently refetches and lets
// the caller decide whether to re-attempt (the buffer is preserved).
export function useEntries() {
  const [rows, setRows] = useState<EntryRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [buffer, setBuffer] = useState('')
  const [saving, setSaving] = useState(false)

  const baseline = useMemo(() => composeBaseline(rows), [rows])
  const snapshots = useMemo(() => rowsToSnapshots(rows), [rows])

  const bufferRef = useRef(buffer)
  useEffect(() => {
    bufferRef.current = buffer
  }, [buffer])

  const replaceFromRows = useCallback((nextRows: EntryRow[]) => {
    setRows(nextRows)
    setBuffer(composeBaseline(nextRows))
  }, [])

  const refetch = useCallback(async () => {
    const r = await ledgerClient.getEntries()
    replaceFromRows(r.rows)
  }, [replaceFromRows])

  useEffect(() => {
    let alive = true
    ledgerClient
      .getEntries()
      .then((r) => {
        if (!alive) return
        setRows(r.rows)
        setBuffer(composeBaseline(r.rows))
        setLoaded(true)
      })
      .catch((e) => {
        if (!alive) return
        setLoadError(e instanceof Error ? e.message : 'Failed to load journal')
        setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const save = useCallback(async (): Promise<SaveOutcome> => {
    if (saving) return { ok: false, message: 'already saving', conflict: false }
    setSaving(true)
    const buf = bufferRef.current
    const plan = diffBuffer(rows, buf)
    const knownIdsToSend = plan ? plan.knownIds : snapshots
    const bufferToSend = plan ? plan.bufferToSend : buf
    try {
      const r: ReplaceBufferResponse = await ledgerClient.replaceBuffer(
        knownIdsToSend,
        bufferToSend,
      )
      if (isReplaceBufferError(r)) {
        if (r.error === 'occ_conflict') {
          await refetch().catch(() => {})
          return {
            ok: false,
            message: 'Journal changed elsewhere. Reloaded the latest version.',
            conflict: true,
          }
        }
        return { ok: false, message: r.message, conflict: false }
      }
      replaceFromRows(r.rows)
      return { ok: true }
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : 'Save failed',
        conflict: false,
      }
    } finally {
      setSaving(false)
    }
  }, [saving, rows, snapshots, refetch, replaceFromRows])

  const isDirty = loaded && buffer !== baseline

  return {
    rows,
    buffer,
    setBuffer,
    baseline,
    snapshots,
    loaded,
    loadError,
    saving,
    isDirty,
    save,
    refetch,
  }
}
