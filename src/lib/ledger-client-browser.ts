import type {
  EntryRef2,
  JournalGetFilteredResponse,
  JournalGetResponse,
  ListEntriesResponse,
  ReplaceBufferConflict,
  ReplaceBufferResponse,
} from '@/durable/ledger-do'
import type { AccountSummaryRow } from '@/durable/ledger-types'

type FetchOpts = { signal?: AbortSignal }

async function getJSON<T>(url: string, opts?: FetchOpts): Promise<T> {
  const res = await fetch(url, { credentials: 'include', signal: opts?.signal })
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`)
  return (await res.json()) as T
}

async function putJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await res.json()) as T
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${url} → HTTP ${res.status}`)
  return (await res.json()) as T
}

export const ledgerClient = {
  getJournal(opts?: FetchOpts): Promise<JournalGetResponse> {
    return getJSON('/api/ledger/journal', opts)
  },
  getEntries(opts?: FetchOpts): Promise<ListEntriesResponse> {
    return getJSON('/api/ledger/journal/entries', opts)
  },
  replaceBuffer(
    knownIds: EntryRef2[],
    buffer: string,
  ): Promise<ReplaceBufferResponse> {
    return putJSON('/api/ledger/journal/batch', { knownIds, buffer })
  },
  getAccounts(
    opts?: FetchOpts,
  ): Promise<{
    accounts: string[]
    balanceTargets: Array<{ account: string; currencies: string[] }>
  }> {
    return getJSON('/api/ledger/accounts', opts)
  },
  getAccountFlows(
    params: { root: string; from: string; to: string },
    opts?: FetchOpts,
  ): Promise<{ rows: Array<{ account: string; currency: string; total: number }> }> {
    const q = new URLSearchParams(params).toString()
    return getJSON(`/api/ledger/account-flows?${q}`, opts)
  },
  getAccountSummaries(
    asOf?: string,
    opts?: FetchOpts,
  ): Promise<{ rows: AccountSummaryRow[] }> {
    const q = asOf ? `?asOf=${asOf}` : ''
    return getJSON(`/api/ledger/summaries${q}`, opts)
  },
  attachStatement(body: {
    mode?: 'inbox'
    filename: string
    text: string
    images?: string[]
  }): Promise<{ id: string }> {
    return postJSON('/api/statements', body)
  },
  resetAgent(): Promise<{ ok: true }> {
    return postJSON('/api/ledger/reset-agent', {})
  },
  getJournalFiltered(
    params: {
      account?: string | null
      dateFrom?: string | null
      dateTo?: string | null
      cursor?: { date: string; id: number } | null
      limit?: number | null
    },
    opts?: FetchOpts,
  ): Promise<JournalGetFilteredResponse> {
    const usp = new URLSearchParams()
    if (params.account) usp.set('account', params.account)
    if (params.dateFrom) usp.set('dateFrom', params.dateFrom)
    if (params.dateTo) usp.set('dateTo', params.dateTo)
    if (params.cursor) {
      usp.set('cursorDate', params.cursor.date)
      usp.set('cursorId', String(params.cursor.id))
    }
    if (params.limit != null) usp.set('limit', String(params.limit))
    return getJSON(`/api/ledger/journal/filtered?${usp.toString()}`, opts)
  },
}

// Commit a batch of drafted ops — add (text, no replaces), edit (replaces + new
// text), delete (replaces, empty text) — as ONE replaceBuffer. `replaces` (the
// original entry's verbatim text) is matched to the live entry by canonical text
// (the same idea as the manual editor's diffBuffer) → its id, so replaceBuffer
// deletes it before inserting the new text. If a `replaces` no longer matches
// (the entry changed underneath), we refuse rather than silently duplicate.
// Used by both the editor chat and the inbox thread chat.
export async function commitDraftOps(
  ops: ReadonlyArray<{ replaces?: string; text: string }>,
): Promise<
  | { ok: true; result: ReplaceBufferResponse; finalText: string }
  | { ok: false; error: string }
> {
  const knownIds: EntryRef2[] = []
  if (ops.some((o) => o.replaces && o.replaces.trim().length > 0)) {
    const { rows } = await ledgerClient.getEntries()
    const byText = new Map<string, typeof rows>()
    for (const row of rows) {
      const k = row.raw_text.trim()
      const q = byText.get(k)
      if (q) q.push(row)
      else byText.set(k, [row])
    }
    let unmatched = 0
    for (const o of ops) {
      const rep = o.replaces?.trim()
      if (!rep) continue
      const row = byText.get(rep)?.shift()
      if (row) knownIds.push({ kind: row.kind, id: row.id, expected_updated_at: row.updated_at })
      else unmatched++
    }
    if (unmatched > 0) {
      return {
        ok: false,
        error: `Couldn't match ${unmatched} entr${unmatched === 1 ? 'y' : 'ies'} to edit/delete — the ledger changed since these were read. Reload and try again.`,
      }
    }
  }
  const finalText = ops
    .map((o) => o.text.trim())
    .filter((t) => t.length > 0)
    .join('\n\n')
  const result = await ledgerClient.replaceBuffer(knownIds, finalText)
  return { ok: true, result, finalText }
}

export function isReplaceBufferConflict(
  r: ReplaceBufferResponse,
): r is ReplaceBufferConflict {
  return 'ok' in r && r.ok === false && r.error === 'occ_conflict'
}

export function isReplaceBufferError(
  r: ReplaceBufferResponse,
): r is Exclude<ReplaceBufferResponse, { ok: true; rows: unknown }> {
  return 'ok' in r && r.ok === false
}
