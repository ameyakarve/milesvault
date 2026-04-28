import type {
  JournalGetResponse,
  JournalPutError,
  JournalPutResponse,
} from '@/durable/ledger-do'
import type { AccountEntriesResponse } from '@/durable/ledger-types'

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
  getJournalForAccount(
    account: string,
    currency: string | null,
    opts?: FetchOpts,
  ): Promise<JournalGetResponse> {
    const base = `/api/ledger/accounts/${encodeURIComponent(account)}/journal`
    const url = currency ? `${base}?currency=${encodeURIComponent(currency)}` : base
    return getJSON(url, opts)
  },
  getAccountCurrencies(
    account: string,
    opts?: FetchOpts,
  ): Promise<{ currencies: string[] }> {
    return getJSON(
      `/api/ledger/accounts/${encodeURIComponent(account)}/currencies`,
      opts,
    )
  },
  getAccountChildren(
    account: string,
    opts?: FetchOpts,
  ): Promise<{ children: string[] }> {
    return getJSON(
      `/api/ledger/accounts/${encodeURIComponent(account)}/children`,
      opts,
    )
  },
  getAccountEntries(
    account: string,
    limit?: number,
    offset?: number,
    opts?: FetchOpts,
  ): Promise<AccountEntriesResponse> {
    const params = new URLSearchParams()
    if (limit != null) params.set('limit', String(limit))
    if (offset != null) params.set('offset', String(offset))
    const q = params.size > 0 ? `?${params.toString()}` : ''
    return getJSON(
      `/api/ledger/accounts/${encodeURIComponent(account)}/entries${q}`,
      opts,
    )
  },
}

export function isJournalPutError(
  r: JournalPutResponse | JournalPutError,
): r is JournalPutError {
  return 'ok' in r && r.ok === false
}
