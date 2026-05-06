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

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Per-day spend heatmap. Plot.cell with x=week-index, y=day-of-week. Month
// names are placed at the top via Plot.text anchored at the column where
// each month starts; weekday labels are sparse (M/W/F) to avoid the
// row-axis fighting the cells.
export function SpendHeatmap({ days, currency, height = 200 }: Props) {
  const render = useCallback(() => {
    if (days.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'p-6 text-[11px] text-slate-400 text-center'
      empty.textContent = 'No spend in selected range'
      return empty
    }
    const symbol = CURRENCY_SYMBOL[currency] ?? ''
    const ONE_DAY = 86_400_000
    const first = parseUTC(days[0]!.date)
    const sundayAnchor = new Date(first)
    sundayAnchor.setUTCDate(sundayAnchor.getUTCDate() - sundayAnchor.getUTCDay())
    const data = days.map((d) => {
      const dt = parseUTC(d.date)
      return {
        ...d,
        week: Math.floor((dt.getTime() - sundayAnchor.getTime()) / (7 * ONE_DAY)),
        weekday: dt.getUTCDay(),
        dayOfMonth: dt.getUTCDate(),
        month: dt.getUTCMonth(),
      }
    })
    const monthLabels = data
      .filter((d) => d.dayOfMonth <= 7 && d.weekday === 0)
      .map((d) => ({ week: d.week, label: MONTH_ABBR[d.month]! }))
    // Quartile thresholds on positive-only days. Without this, a few spike
    // days dominate the linear scale and every other cell collapses to the
    // lightest shade (GitHub uses the same trick for contributions).
    const positives = data
      .map((d) => d.amount)
      .filter((a) => a > 0)
      .sort((a, b) => a - b)
    const q = (p: number) => positives[Math.floor(positives.length * p)] ?? 1
    const thresholds =
      positives.length > 0 ? [0.5, q(0.25), q(0.5), q(0.75)] : [0.5, 1, 2, 3]
    return Plot.plot({
      height,
      marginLeft: 32,
      marginRight: 12,
      marginTop: 24,
      marginBottom: 8,
      style: { background: 'transparent', fontFamily: 'inherit', fontSize: '10px' },
      x: { axis: null, type: 'band', padding: 0.12 },
      y: {
        axis: 'left',
        label: null,
        tickSize: 0,
        type: 'band',
        domain: [0, 1, 2, 3, 4, 5, 6],
        tickFormat: (i: number) => (i === 1 ? 'Mon' : i === 3 ? 'Wed' : i === 5 ? 'Fri' : ''),
        padding: 0.12,
      },
      color: {
        type: 'threshold',
        domain: thresholds,
        range: ['#f1f5f9', '#bdf0e6', '#5cc4b3', '#0f766e', '#0a4f4a'],
      },
      marks: [
        Plot.cell(data, {
          x: 'week',
          y: 'weekday',
          fill: 'amount',
          inset: 1,
          rx: 2,
        }),
        Plot.text(monthLabels, {
          x: 'week',
          text: 'label',
          frameAnchor: 'top',
          dy: -10,
          fontSize: 10,
          fill: '#475569',
          textAnchor: 'start',
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
