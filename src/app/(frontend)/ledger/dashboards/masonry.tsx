'use client'

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

type Props = {
  children: ReactNode
  columns?: number
  gap?: number
  className?: string
}

type Position = { left: number; top: number; width: number }

// Marker wrapper used to opt into a multi-column span. Renders its children
// transparently when used outside Masonry; inside Masonry, the wrapper is
// stripped during placement and only the inner element is rendered.
export function MasonryItem({ children }: { span?: number; children: ReactNode }) {
  return <>{children}</>
}

// Greedy multi-column masonry with optional column spans. Each item is placed
// at the leftmost window of `span` adjacent columns whose tallest bottom edge
// is lowest — extends the Pinterest single-column algorithm to wide bricks.
// Re-measures on container resize and on each item's intrinsic resize (charts
// load lazily so initial heights are 0 until their first paint).
export function Masonry({ children, columns = 3, gap = 24, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Array<HTMLDivElement | null>>([])
  const items = Children.toArray(children)
    .filter(isValidElement)
    .map((child) => {
      if ((child as ReactElement).type === MasonryItem) {
        const props = (child as ReactElement<{ span?: number; children: ReactNode }>).props
        const rawSpan = props.span ?? 1
        const span = Math.max(1, Math.min(columns, Math.floor(rawSpan)))
        const inner = Children.toArray(props.children).filter(isValidElement)[0] ?? null
        return { span, node: inner }
      }
      return { span: 1, node: child as ReactElement }
    })
    .filter((it): it is { span: number; node: ReactElement } => it.node != null)

  itemRefs.current = itemRefs.current.slice(0, items.length)
  while (itemRefs.current.length < items.length) itemRefs.current.push(null)

  const [containerWidth, setContainerWidth] = useState(0)
  const [heights, setHeights] = useState<number[]>([])

  const measure = useCallback(() => {
    const c = containerRef.current
    if (c) {
      const w = c.clientWidth
      setContainerWidth((prev) => (prev !== w ? w : prev))
    }
    const next = itemRefs.current.map((el) => el?.offsetHeight ?? 0)
    setHeights((prev) => {
      if (prev.length !== next.length) return next
      for (let i = 0; i < next.length; i++) if (prev[i] !== next[i]) return next
      return prev
    })
  }, [])

  useLayoutEffect(() => {
    measure()
  }, [measure, items.length])

  useEffect(() => {
    const ro = new ResizeObserver(() => measure())
    if (containerRef.current) ro.observe(containerRef.current)
    itemRefs.current.forEach((el) => {
      if (el) ro.observe(el)
    })
    return () => ro.disconnect()
  }, [measure, items.length])

  const colWidth =
    containerWidth > 0 ? Math.max(0, (containerWidth - gap * (columns - 1)) / columns) : 0

  const positions: Position[] = []
  const colBottoms = new Array(columns).fill(0)
  for (let i = 0; i < items.length; i++) {
    const span = items[i]!.span
    // Scan every contiguous window of `span` columns; pick the leftmost one
    // whose tallest bottom is smallest. Ties resolve left because the strict
    // `<` keeps the first-seen window.
    let bestCol = 0
    let bestMaxBottom = Infinity
    for (let c = 0; c <= columns - span; c++) {
      let maxBottom = 0
      for (let k = 0; k < span; k++) maxBottom = Math.max(maxBottom, colBottoms[c + k])
      if (maxBottom < bestMaxBottom) {
        bestMaxBottom = maxBottom
        bestCol = c
      }
    }
    const top = bestMaxBottom === 0 ? 0 : bestMaxBottom + gap
    const left = bestCol * (colWidth + gap)
    const width = span * colWidth + (span - 1) * gap
    positions.push({ left, top, width })
    const newBottom = top + (heights[i] ?? 0)
    for (let k = 0; k < span; k++) colBottoms[bestCol + k] = newBottom
  }
  const containerHeight = Math.max(0, ...colBottoms)
  const ready = containerWidth > 0

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: ready ? containerHeight : undefined,
      }}
    >
      {items.map((it, i) => {
        const pos = positions[i]
        return (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            style={{
              position: 'absolute',
              left: pos.left,
              top: pos.top,
              width: ready ? pos.width : '100%',
              opacity: ready ? 1 : 0,
              transition: 'left 200ms ease, top 200ms ease, width 200ms ease',
            }}
          >
            {it.node}
          </div>
        )
      })}
    </div>
  )
}
