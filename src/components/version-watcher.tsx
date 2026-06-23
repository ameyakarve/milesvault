'use client'

import { useEffect, useState } from 'react'

// Compares the build id baked into THIS bundle (NEXT_PUBLIC_BUILD_ID, inlined at
// build) against the currently-deployed worker's build id (/api/version). On a
// mismatch the tab is running stale JS — show a non-intrusive prompt to reload.
// Checks on mount, when the tab regains focus, and every few minutes. We never
// auto-reload (it'd nuke in-progress input); the user clicks when ready.
export function VersionWatcher() {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    const mine = process.env.NEXT_PUBLIC_BUILD_ID
    // No baked id (dev without one) → nothing to compare against.
    if (!mine) return
    let alive = true

    async function check() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const { buildId } = (await res.json()) as { buildId: string | null }
        if (alive && buildId && buildId !== mine) setStale(true)
      } catch {
        /* offline / transient — ignore, try again next tick */
      }
    }

    void check()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const onFocus = () => {
      void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    const timer = setInterval(() => void check(), 5 * 60 * 1000)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
      clearInterval(timer)
    }
  }, [])

  if (!stale) return null
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm text-card-foreground shadow-lg">
        <span>A new version is available.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background hover:opacity-90"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
