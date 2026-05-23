'use client'

import dynamic from 'next/dynamic'
import type { ShowVegaProps } from '@/durable/agent-ui-schemas'

const VegaEmbed = dynamic(() => import('react-vega').then((m) => m.VegaEmbed), {
  ssr: false,
  loading: () => <ChartShell loading />,
})

const THEME_CONFIG = {
  view: { stroke: null as null },
  axis: {
    labelColor: '#475569',
    titleColor: '#475569',
    grid: true,
    gridColor: '#e2e8f0',
    domain: false,
    tickColor: '#cbd5e1',
  },
  legend: { labelColor: '#475569', titleColor: '#475569' },
}

export function VegaChart({ input }: { input: ShowVegaProps }) {
  const baseSpec = (input.spec ?? {}) as Record<string, unknown>
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 280,
    ...baseSpec,
  }
  return (
    <ChartShell title={input.title}>
      <VegaEmbed
        spec={spec as never}
        options={{ actions: false, renderer: 'svg', config: THEME_CONFIG as never }}
      />
    </ChartShell>
  )
}

function ChartShell({
  title,
  loading,
  children,
}: {
  title?: string
  loading?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-[12px] border border-slate-200 bg-white p-4">
      {title && <div className="mb-2 text-sm font-medium text-slate-900">{title}</div>}
      {loading ? (
        <div className="flex h-[280px] items-center justify-center text-xs text-slate-400">
          Loading chart…
        </div>
      ) : (
        children
      )}
    </div>
  )
}
