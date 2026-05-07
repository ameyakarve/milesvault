'use client'

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Heatmap } from '@mantine/charts'
import { CURRENCY_SYMBOL, compactAmount } from './format'

// Heatmap geometry. Kept as constants so the fixed weekday column on the
// left can match the SVG's per-row vertical rhythm exactly.
const RECT_SIZE = 14
const GAP = 2
const ROW_HEIGHT = RECT_SIZE + GAP
const MONTHS_LABEL_HEIGHT = 16
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

type Day = { date: string; amount: number; label: string }

type Props = {
  days: Day[]
  currency: string
}

export function SpendHeatmap({ days, currency }: Props) {
  const symbol = CURRENCY_SYMBOL[currency] ?? ''
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Mantine maps value/max linearly to the color ramp, so a handful of big
  // spend days flatten everything else into the palest bucket. Feed log1p to
  // the heatmap so typical days land in mid-range colors; keep the original
  // amount on a side map for the tooltip.
  const colorData = useMemo(() => {
    const out: Record<string, number> = {}
    for (const d of days) out[d.date] = d.amount > 0 ? Math.log1p(d.amount) : 0
    return out
  }, [days])

  const originals = useMemo(() => {
    const out: Record<string, number> = {}
    for (const d of days) out[d.date] = d.amount
    return out
  }, [days])

  // Pin the scroll viewport to the right edge — the most recent weeks are
  // the interesting ones. Re-clamps when the data range changes (period
  // filter) and on resize so the right edge stays anchored as the column
  // grows or shrinks.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth - el.clientWidth
  }, [days.length])

  useEffect(() => {
    const handle = () => {
      const el = scrollRef.current
      if (el) el.scrollLeft = el.scrollWidth - el.clientWidth
    }
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [])

  const scrollByPage = (dir: -1 | 1) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.6, behavior: 'smooth' })
  }

  if (days.length === 0) {
    return <div className="p-6 text-[11px] text-slate-400 text-center">No spend in selected range</div>
  }

  const startDate = days[0]!.date
  const endDate = days[days.length - 1]!.date

  return (
    <div className="flex items-stretch gap-1">
      <div
        className="shrink-0 flex flex-col text-[10px] font-mono text-slate-500"
        style={{ paddingTop: MONTHS_LABEL_HEIGHT }}
      >
        {WEEKDAYS.map((d, i) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            className="flex items-center justify-end pr-1.5"
            style={{ height: ROW_HEIGHT, width: 20 }}
          >
            {d}
          </div>
        ))}
      </div>

      <button
        type="button"
        aria-label="Scroll earlier"
        onClick={() => scrollByPage(-1)}
        className="shrink-0 self-center w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      <div
        ref={scrollRef}
        className="flex-1 min-w-0 overflow-x-scroll pb-1 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-400"
      >
        <Heatmap
          data={colorData}
          startDate={startDate}
          endDate={endDate}
          withMonthLabels
          withWeekdayLabels={false}
          firstDayOfWeek={0}
          rectSize={RECT_SIZE}
          gap={GAP}
          rectRadius={2}
          monthsLabelsHeight={MONTHS_LABEL_HEIGHT}
          fontSize={10}
          withTooltip
          withOutsideDates={false}
          colors={['#f1f5f9', '#7fd9c5', '#34b8a3', '#0f766e', '#0a4f4a']}
          getTooltipLabel={({ date }) => {
            const amount = originals[date] ?? 0
            return amount > 0
              ? `${date} · ${symbol}${compactAmount(amount, currency)}`
              : `${date} · no charges`
          }}
        />
      </div>

      <button
        type="button"
        aria-label="Scroll later"
        onClick={() => scrollByPage(1)}
        className="shrink-0 self-center w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
  )
}
