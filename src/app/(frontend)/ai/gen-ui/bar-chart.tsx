'use client'

import { BarChart } from '@mantine/charts'
import type { BarChartProps } from '@/durable/agent-ui-schemas'
import { makeFormatter, pickColor } from './colors'

export function BarChartRenderer({ input }: { input: BarChartProps }) {
  const series = input.series.map((s, i) => ({
    name: s.key,
    label: s.label ?? s.key,
    color: pickColor(s.color, i),
  }))
  const format = makeFormatter(input.value_format, input.currency)
  const horizontal = input.orientation === 'horizontal'
  const height = horizontal ? Math.max(160, input.data.length * 28 + 64) : 280

  return (
    <div className="w-full">
      {input.title && (
        <div className="mb-2 text-xs font-medium text-slate-700">
          {input.title}
        </div>
      )}
      <BarChart
        h={height}
        data={input.data as Array<Record<string, string | number>>}
        dataKey={input.x_key}
        orientation={horizontal ? 'vertical' : 'horizontal'}
        series={series}
        withLegend={series.length > 1}
        legendProps={{ verticalAlign: 'bottom', height: 32 }}
        valueFormatter={format}
        tickLine={horizontal ? 'x' : 'y'}
        gridAxis={horizontal ? 'x' : 'y'}
      />
    </div>
  )
}
