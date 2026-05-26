import type {
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
}

export function isJournalPutError(
  r: JournalPutResponse | JournalPutError,
): r is JournalPutError {
  return 'ok' in r && r.ok === false
}
