'use client'

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type Props = {
  children: ReactNode
  columns?: number
  gap?: number
  className?: string
}

type Position = { left: number; top: number; width: number }

// Greedy 3-column masonry. Each child is placed in whichever column currently
// has the lowest cumulative bottom edge — same algorithm Pinterest uses.
// Re-measures on container resize and on each item's intrinsic resize (charts
// load lazily so initial heights are 0 until their first paint).
export function Masonry({ children, columns = 3, gap = 24, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Array<HTMLDivElement | null>>([])
  const items = Children.toArray(children).filter(isValidElement)

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
    let minCol = 0
    for (let c = 1; c < columns; c++) if (colBottoms[c] < colBottoms[minCol]) minCol = c
    const top = colBottoms[minCol] === 0 ? 0 : colBottoms[minCol] + gap
    const left = minCol * (colWidth + gap)
    positions.push({ left, top, width: colWidth })
    colBottoms[minCol] = top + (heights[i] ?? 0)
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
      {items.map((child, i) => {
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
            {child}
          </div>
        )
      })}
    </div>
  )
}
