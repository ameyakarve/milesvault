'use client'

import { useMemo } from 'react'
import { Heatmap } from '@mantine/charts'
import { CURRENCY_SYMBOL, compactAmount } from './format'

type Day = { date: string; amount: number; label: string }

type Props = {
  days: Day[]
  currency: string
}

export function SpendHeatmap({ days, currency }: Props) {
  const symbol = CURRENCY_SYMBOL[currency] ?? ''

  const data = useMemo(() => {
    const out: Record<string, number> = {}
    for (const d of days) out[d.date] = d.amount
    return out
  }, [days])

  if (days.length === 0) {
    return <div className="p-6 text-[11px] text-slate-400 text-center">No spend in selected range</div>
  }

  const startDate = days[0]!.date
  const endDate = days[days.length - 1]!.date

  return (
    <Heatmap
      data={data}
      startDate={startDate}
      endDate={endDate}
      withMonthLabels
      withWeekdayLabels
      withTooltip
      withOutsideDates={false}
      colors={['#f1f5f9', '#bdf0e6', '#5cc4b3', '#0f766e', '#0a4f4a']}
      getTooltipLabel={({ date, value }) =>
        value && value > 0
          ? `${date} · ${symbol}${compactAmount(value, currency)}`
          : `${date} · no charges`
      }
    />
  )
}
