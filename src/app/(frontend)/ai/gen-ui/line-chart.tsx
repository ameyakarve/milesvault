'use client'

import { LineChart } from '@mantine/charts'
import type { LineChartProps } from '@/durable/agent-ui-schemas'
import { makeFormatter, pickColor } from './colors'

export function LineChartRenderer({ input }: { input: LineChartProps }) {
  const series = input.series.map((s, i) => ({
    name: s.key,
    label: s.label ?? s.key,
    color: pickColor(s.color, i),
  }))
  const format = makeFormatter(input.value_format, input.currency)

  return (
    <div className="w-full">
      {input.title && (
        <div className="mb-2 text-xs font-medium text-slate-700">
          {input.title}
        </div>
      )}
      <LineChart
        h={280}
        data={input.data as Array<Record<string, string | number>>}
        dataKey={input.x_key}
        series={series}
        curveType={input.curve_type ?? 'monotone'}
        withLegend={series.length > 1}
        legendProps={{ verticalAlign: 'bottom', height: 32 }}
        valueFormatter={format}
        tickLine="y"
        gridAxis="y"
        withDots={false}
      />
    </div>
  )
}
