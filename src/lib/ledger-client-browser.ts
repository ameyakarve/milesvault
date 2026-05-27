import type {
  JournalGetFilteredResponse,
  JournalGetResponse,
  JournalPutError,
  JournalPutResponse,
} from '@/durable/ledger-do'

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

export const ledgerClient = {
  getJournal(opts?: FetchOpts): Promise<JournalGetResponse> {
    return getJSON('/api/ledger/journal', opts)
  },
  putJournal(text: string): Promise<JournalPutResponse | JournalPutError> {
    return putJSON('/api/ledger/journal', { text })
  },
  getAccounts(opts?: FetchOpts): Promise<{ accounts: string[] }> {
    return getJSON('/api/ledger/accounts', opts)
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

export function isJournalPutError(
  r: JournalPutResponse | JournalPutError,
): r is JournalPutError {
  return 'ok' in r && r.ok === false
}
