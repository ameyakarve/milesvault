import type { LedgerReader, ReaderRow } from './types'

export type AgentRow = {
  id: number | null
  tempId?: string
  raw_text: string
  updated_at: number
  editable: boolean
  source: 'client' | 'server'
  reason?: string
}

export type AgentSearchResult = {
  rows: AgentRow[]
  total: number
  warnings: string[]
}

export type MergedReader = {
  search(q: string, limit: number, offset: number): Promise<AgentSearchResult>
  get(
    idOrTempId: number | string,
  ): Promise<AgentRow | { ok: false; reason: string } | null>
}

export function createMergedReader(opts: {
  server: LedgerReader
  client: LedgerReader
  renderedIds: () => Set<number>
  hasUnsavedChanges: () => boolean
}): MergedReader {
  const { server, client, renderedIds, hasUnsavedChanges } = opts

  function annotate(row: ReaderRow, source: 'client' | 'server'): AgentRow {
    const rendered = row.id != null && renderedIds().has(row.id)
    const isTempOnly = row.id == null && !!row.tempId
    if (source === 'client' && (rendered || isTempOnly)) {
      return {
        id: row.id,
        tempId: row.tempId,
        raw_text: row.raw_text,
        updated_at: row.updated_at,
        editable: true,
        source: 'client',
      }
    }
    if (source === 'server' && rendered) {
      return {
        id: row.id,
        raw_text: row.raw_text,
        updated_at: row.updated_at,
        editable: true,
        source: 'server',
      }
    }
    if (source === 'server') {
      if (hasUnsavedChanges()) {
        return {
          id: row.id,
          raw_text: row.raw_text,
          updated_at: row.updated_at,
          editable: false,
          source: 'server',
          reason:
            'unsaved buffer changes — ask the user to save before editing older entries',
        }
      }
      return {
        id: row.id,
        raw_text: row.raw_text,
        updated_at: row.updated_at,
        editable: false,
        source: 'server',
        reason:
          'out of viewport — ask the user to widen the editor filter before editing',
      }
    }
    return {
      id: row.id,
      tempId: row.tempId,
      raw_text: row.raw_text,
      updated_at: row.updated_at,
      editable: false,
      source: 'client',
      reason: 'not rendered',
    }
  }

  return {
    async search(q, limit, offset): Promise<AgentSearchResult> {
      const unsaved = hasUnsavedChanges()
      console.log(
        `[reader] search q=${JSON.stringify(q)} limit=${limit} offset=${offset} ` +
          `→ hitting server${unsaved ? ' + client (unsaved buffer)' : ' only (clean buffer)'}`,
      )
      const [serverRes, clientRes] = await Promise.all([
        server.search(q, limit, offset),
        unsaved ? client.search(q, limit, offset) : Promise.resolve(null),
      ])
      console.log(
        `[reader] search q=${JSON.stringify(q)} server=${serverRes.rows.length}/${serverRes.total} ` +
          `client=${clientRes ? `${clientRes.rows.length}/${clientRes.total}` : 'skipped'}`,
      )

      const merged = new Map<string, AgentRow>()
      const warnings: string[] = []

      // Client rows first (authoritative over server for same id).
      if (clientRes) {
        for (const r of clientRes.rows) {
          const key = r.tempId ? `t:${r.tempId}` : `i:${r.id}`
          merged.set(key, annotate(r, 'client'))
        }
      }
      for (const r of serverRes.rows) {
        if (r.id == null) continue
        const key = `i:${r.id}`
        if (!merged.has(key)) merged.set(key, annotate(r, 'server'))
      }

      if (unsaved) {
        warnings.push(
          'buffer has unsaved changes — client rows override server; non-rendered server rows are read-only until the user saves',
        )
      }

      const rows = Array.from(merged.values())
      return { rows, total: rows.length, warnings }
    },

    async get(idOrTempId) {
      if (typeof idOrTempId === 'string') {
        console.log(`[reader] get tempId=${idOrTempId} → client only`)
        const r = await client.get(idOrTempId)
        return r ? annotate(r, 'client') : null
      }
      const rendered = renderedIds().has(idOrTempId)
      if (rendered) {
        console.log(`[reader] get id=${idOrTempId} → client (rendered in viewport)`)
        const r = await client.get(idOrTempId)
        if (r) return annotate(r, 'client')
        console.log(`[reader] get id=${idOrTempId} → client miss, falling back to server`)
      } else {
        console.log(`[reader] get id=${idOrTempId} → server (not in viewport)`)
      }
      const s = await server.get(idOrTempId)
      if (!s) return null
      return annotate(s, 'server')
    },
  }
}
