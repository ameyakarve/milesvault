import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ledgerClient, isReplaceBufferError } from '@/lib/ledger-client-browser'
import type {
  EntryRef2,
  EntryRow,
  ReplaceBufferResponse,
} from '@/durable/ledger-do'

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
    try {
      const r: ReplaceBufferResponse = await ledgerClient.replaceBuffer(
        snapshots,
        buf,
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
  }, [saving, snapshots, refetch, replaceFromRows])

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
