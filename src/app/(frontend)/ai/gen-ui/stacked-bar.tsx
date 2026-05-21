'use client'

import { BarChart } from '@mantine/charts'
import type { StackedBarProps } from '@/durable/agent-ui-schemas'

const FALLBACK_COLORS = [
  'teal.6',
  'violet.5',
  'blue.5',
  'orange.5',
  'pink.5',
  'lime.6',
  'cyan.6',
  'gray.6',
]

export function StackedBar({ input }: { input: StackedBarProps }) {
  const series = input.series.map((s, i) => ({
    name: s.key,
    label: s.label ?? s.key,
    color: s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }))

  const formatter =
    input.value_format === 'currency'
      ? new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: input.currency || 'USD',
          maximumFractionDigits: 0,
        })
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

  return (
    <div className="w-full">
      {input.title && (
        <div className="mb-2 text-xs font-medium text-slate-700">
          {input.title}
        </div>
      )}
      <BarChart
        h={280}
        data={input.data as Array<Record<string, string | number>>}
        dataKey={input.x_key}
        type="stacked"
        series={series}
        withLegend
        legendProps={{ verticalAlign: 'bottom', height: 32 }}
        valueFormatter={(value) => formatter.format(value)}
        tickLine="y"
        gridAxis="y"
      />
    </div>
  )
}
