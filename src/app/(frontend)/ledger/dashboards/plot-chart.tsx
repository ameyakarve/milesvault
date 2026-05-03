'use client'

import { useEffect, useRef } from 'react'

// Generic React wrapper around Observable Plot. Plot returns a DOM node; this
// mounts it into a wrapper div and tears it down on unmount or when the
// `render` callback identity changes. The caller is expected to memoize
// `render` (e.g. via useCallback) so we don't replot on every parent rerender.
export function PlotChart({
  render,
  className,
}: {
  render: () => SVGElement | HTMLElement
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = ref.current
    if (!host) return
    const node = render()
    host.replaceChildren(node)
    return () => {
      host.replaceChildren()
    }
  }, [render])

  return <div ref={ref} className={className} />
}
