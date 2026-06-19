'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type AsyncStatus = 'loading' | 'ready' | 'error'

export type AsyncData<T> = {
  status: AsyncStatus
  data: T | null
  error: string | null
  reload: () => void
}

// The one place the browser fetch lifecycle lives: runs `fn` whenever `deps`
// change (and on `reload()`), tracks loading/ready/error, and cancels the
// in-flight request on unmount or re-query via an AbortSignal. Replaces the
// hand-rolled `let cancelled` + `.catch(() => {})` boilerplate that swallowed
// errors across the app — the error is now captured and surfaceable (pair with
// CenteredState's `onRetry`). `fn` is read through a ref so callers don't need
// to memoize it; the effect re-runs on `deps`, not on `fn` identity.
export function useAsyncData<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList,
): AsyncData<T> {
  const [state, setState] = useState<{ status: AsyncStatus; data: T | null; error: string | null }>(
    { status: 'loading', data: null, error: null },
  )
  const [nonce, setNonce] = useState(0)
  const fnRef = useRef(fn)
  // Keep the latest fn without retriggering the fetch effect (which keys off
  // `deps`, not fn identity). Declared before the fetch effect so it updates first.
  useEffect(() => {
    fnRef.current = fn
  })

  useEffect(() => {
    const ctrl = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => (s.status === 'loading' && s.error === null ? s : { ...s, status: 'loading', error: null }))
    fnRef
      .current(ctrl.signal)
      .then((data) => {
        if (!ctrl.signal.aborted) setState({ status: 'ready', data, error: null })
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return
        setState({ status: 'error', data: null, error: e instanceof Error ? e.message : String(e) })
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { ...state, reload }
}
