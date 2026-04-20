import { splitEntries, extractTxn } from '@/lib/beancount/extract'
import type { MapEntry } from './map'

export type SnapshotLike = {
  id: number
  raw_text: string
  expected_updated_at: number
}

/**
 * Build a flat list of MapEntry from the current editor buffer.
 * Each entry's id is resolved by matching its trimmed raw_text against a
 * snapshot's trimmed raw_text; entries with no matching snapshot (new
 * creates or dirty edits) get a negative synthetic id (-1, -2, …) so the
 * caller can reference them via the same `id` field as saved rows.
 * Negative ids never collide with server autoincrement ids (always > 0).
 * Entries that don't parse still land in the index with empty t_* fields
 * so they're findable by id.
 */
export function buildEntriesFromBuffer(
  buffer: string,
  snapshots: ReadonlyArray<SnapshotLike>,
): MapEntry[] {
  const parts = splitEntries(buffer)
  const snapByRaw = new Map<string, SnapshotLike>()
  for (const s of snapshots) snapByRaw.set(s.raw_text.trim(), s)

  const entries: MapEntry[] = []
  let tempCounter = 0
  for (const p of parts) {
    const text = p.text.trim()
    if (!text) continue
    const snap = snapByRaw.get(text)
    const extracted = extractTxn(text)
    const cols =
      extracted.ok === true
        ? extracted.value
        : {
            date: 0,
            flag: null,
            t_payee: '',
            t_account: '',
            t_currency: '',
            t_tag: '',
            t_link: '',
          }
    entries.push({
      id: snap?.id ?? -(++tempCounter),
      raw_text: text,
      date: cols.date,
      flag: cols.flag,
      t_payee: cols.t_payee,
      t_account: cols.t_account,
      t_currency: cols.t_currency,
      t_tag: cols.t_tag,
      t_link: cols.t_link,
      created_at: 0,
      updated_at: snap?.expected_updated_at ?? 0,
    })
  }
  return entries
}

export function renderedIdsFromEntries(entries: ReadonlyArray<MapEntry>): Set<number> {
  const set = new Set<number>()
  for (const e of entries) set.add(e.id)
  return set
}
