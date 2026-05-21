'use client'

import { DonutChart } from '@mantine/charts'
import type { DonutChartProps } from '@/durable/agent-ui-schemas'
import { makeFormatter, pickColor } from './colors'

export function DonutChartRenderer({ input }: { input: DonutChartProps }) {
  const data = input.data.map((d, i) => ({
    name: d.name,
    value: d.value,
    color: pickColor(d.color, i),
  }))
  const format = makeFormatter(input.value_format, input.currency)

  return (
    <div className="w-full">
      {input.title && (
        <div className="mb-2 text-xs font-medium text-slate-700">
          {input.title}
        </div>
      )}
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <DonutChart
          data={data}
          size={180}
          thickness={28}
          withLabels={false}
          valueFormatter={format}
        />
        <ul className="flex flex-1 flex-col gap-1.5 text-xs text-slate-700">
          {data.map((d) => (
            <li key={d.name} className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: `var(--mantine-color-${d.color.replace('.', '-')})` }}
              />
              <span className="flex-1 truncate">{d.name}</span>
              <span className="tabular-nums text-slate-500">
                {format(d.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
