// Single front-door for browser → API JSON fetches. Throws a useful Error on a
// non-2xx (message taken from the response body when present, else the status),
// so callers can SURFACE the failure instead of the pervasive `.catch(() => {})`
// that left users staring at a spinner that never resolves. Pass an AbortSignal
// (see useAsyncData) so in-flight requests cancel cleanly on unmount / re-query.
export async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body.trim() || `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}
