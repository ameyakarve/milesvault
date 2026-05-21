'use client'

import type { HeatmapProps } from '@/durable/agent-ui-schemas'
import { SpendHeatmap } from '@/app/(frontend)/ledger/dashboards/spend-heatmap'

export function HeatmapRenderer({ input }: { input: HeatmapProps }) {
  const days = input.days.map((d) => ({
    date: d.date,
    amount: d.amount,
    label: '',
  }))

  return (
    <div className="w-full">
      {input.title && (
        <div className="mb-2 text-xs font-medium text-slate-700">
          {input.title}
        </div>
      )}
      <SpendHeatmap days={days} currency={input.currency} />
    </div>
  )
}
