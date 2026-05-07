'use client'

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Heatmap } from '@mantine/charts'
import { CURRENCY_SYMBOL, compactAmount } from './format'

type Day = { date: string; amount: number; label: string }

type Props = {
  days: Day[]
  currency: string
}

export function SpendHeatmap({ days, currency }: Props) {
  const symbol = CURRENCY_SYMBOL[currency] ?? ''
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const data = useMemo(() => {
    const out: Record<string, number> = {}
    for (const d of days) out[d.date] = d.amount
    return out
  }, [days])

  // Clamp the horizontal scroll to the right edge on mount and whenever the
  // data range changes — the most recent weeks are the interesting ones, so
  // they're what should be visible by default. The user can scroll left to
  // see earlier months.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft = el.scrollWidth - el.clientWidth
  }, [days])

  // Re-clamp on window resize so the right edge stays pinned when the layout
  // grows or shrinks (e.g., sidebar opens, viewport changes).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handle = () => {
      el.scrollLeft = el.scrollWidth - el.clientWidth
    }
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [])

  if (days.length === 0) {
    return <div className="p-6 text-[11px] text-slate-400 text-center">No spend in selected range</div>
  }

  const startDate = days[0]!.date
  const endDate = days[days.length - 1]!.date

  // Mantine's Heatmap renders a fixed-size SVG (rectSize × weeks). Instead
  // of scaling — which clipped rows — we let the SVG keep its natural pixel
  // size and put it inside an overflow-x scroll container clamped to the
  // right by default. Cells stay readable; earlier months are one swipe away.
  return (
    <div ref={scrollRef} className="overflow-x-auto">
      <Heatmap
        data={data}
        startDate={startDate}
        endDate={endDate}
        withMonthLabels
        withWeekdayLabels
        weekdayLabels={['S', 'M', 'T', 'W', 'T', 'F', 'S']}
        firstDayOfWeek={0}
        rectSize={10}
        gap={2}
        rectRadius={2}
        weekdaysLabelsWidth={18}
        monthsLabelsHeight={14}
        fontSize={9}
        withTooltip
        withOutsideDates={false}
        colors={['#f1f5f9', '#bdf0e6', '#5cc4b3', '#0f766e', '#0a4f4a']}
        getTooltipLabel={({ date, value }) =>
          value && value > 0
            ? `${date} · ${symbol}${compactAmount(value, currency)}`
            : `${date} · no charges`
        }
      />
    </div>
  )
}
