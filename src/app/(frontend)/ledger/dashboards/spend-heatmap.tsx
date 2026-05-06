'use client'

import { useCallback } from 'react'
import * as Plot from '@observablehq/plot'
import { PlotChart } from './plot-chart'
import { CURRENCY_SYMBOL, compactAmount } from './format'

type Day = { date: string; amount: number; label: string }

type Props = {
  days: Day[]
  currency: string
  height?: number
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Per-day spend heatmap. Plot.cell with x=ISO-week-index, y=day-of-week.
// Color intensity ramps with daily spend; zero-charge days fade to a light
// background tile so the calendar grid stays visible across the whole window.
export function SpendHeatmap({ days, currency, height = 180 }: Props) {
  const render = useCallback(() => {
    if (days.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'p-6 text-[11px] text-slate-400 text-center'
      empty.textContent = 'No spend in selected range'
      return empty
    }
    const symbol = CURRENCY_SYMBOL[currency] ?? ''
    // Anchor week 0 on the first day's Sunday so the grid lays out left→right
    // by week. Plot doesn't have a native calendar mark; this is the standard
    // idiom from the Plot docs (cell + x=weekIndex, y=weekday).
    const first = parseUTC(days[0]!.date)
    const sundayAnchor = new Date(first)
    sundayAnchor.setUTCDate(sundayAnchor.getUTCDate() - sundayAnchor.getUTCDay())
    const ONE_DAY = 86_400_000
    const data = days.map((d) => {
      const dt = parseUTC(d.date)
      const week = Math.floor((dt.getTime() - sundayAnchor.getTime()) / (7 * ONE_DAY))
      return {
        ...d,
        week,
        weekday: dt.getUTCDay(),
      }
    })
    const maxSpend = Math.max(1, ...data.map((d) => d.amount))
    return Plot.plot({
      height,
      marginLeft: 24,
      marginRight: 8,
      marginTop: 8,
      marginBottom: 8,
      style: { background: 'transparent', fontFamily: 'inherit', fontSize: '10px' },
      x: { axis: null, type: 'band', padding: 0.12 },
      y: {
        axis: 'left',
        tickSize: 0,
        tickFormat: (i: number) => WEEKDAY_LABELS[i] ?? '',
        type: 'band',
        domain: [0, 1, 2, 3, 4, 5, 6],
        padding: 0.12,
      },
      color: {
        type: 'linear',
        domain: [0, maxSpend],
        range: ['#f1f5f9', '#0f766e'],
      },
      marks: [
        Plot.cell(data, {
          x: 'week',
          y: 'weekday',
          fill: 'amount',
          inset: 1,
          rx: 2,
        }),
        Plot.tip(
          data,
          Plot.pointer({
            x: 'week',
            y: 'weekday',
            title: (d: { date: string; amount: number }) =>
              d.amount > 0
                ? `${d.date} · ${symbol}${compactAmount(d.amount, currency)}`
                : `${d.date} · no charges`,
          }),
        ),
      ],
    })
  }, [days, currency, height])

  return <PlotChart render={render} className="w-full" />
}

function parseUTC(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d))
}
