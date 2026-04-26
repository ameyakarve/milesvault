'use client'

import { useEffect, useState } from 'react'

export type FetchState<T> = {
  status: 'loading' | 'idle' | 'error'
  data: T | null
  errorMsg: string | null
}

export function useFetch<T>(url: string | null, deps: unknown[] = []): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({
    status: url ? 'loading' : 'idle',
    data: null,
    errorMsg: null,
  })
  useEffect(() => {
    if (!url) {
      setState({ status: 'idle', data: null, errorMsg: null })
      return
    }
    const controller = new AbortController()
    setState({ status: 'loading', data: null, errorMsg: null })
    fetch(url, { signal: controller.signal, credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as T
      })
      .then((data) => setState({ status: 'idle', data, errorMsg: null }))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setState({
          status: 'error',
          data: null,
          errorMsg: e instanceof Error ? e.message : String(e),
        })
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps])
  return state
}
