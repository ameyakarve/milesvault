'use client'

import { GEN_UI_TOOLS, type GenUiToolName } from '@/durable/agent-ui-schemas'
import { StackedBar } from './stacked-bar'
import { BarChartRenderer } from './bar-chart'
import { LineChartRenderer } from './line-chart'
import { DonutChartRenderer } from './donut-chart'

const RENDERERS: {
  [K in GenUiToolName]: (input: unknown) => React.ReactElement | null
} = {
  show_stacked_bar: (input) => {
    const parsed = GEN_UI_TOOLS.show_stacked_bar.safeParse(input)
    if (!parsed.success) return null
    return <StackedBar input={parsed.data} />
  },
  show_bar_chart: (input) => {
    const parsed = GEN_UI_TOOLS.show_bar_chart.safeParse(input)
    if (!parsed.success) return null
    return <BarChartRenderer input={parsed.data} />
  },
  show_line_chart: (input) => {
    const parsed = GEN_UI_TOOLS.show_line_chart.safeParse(input)
    if (!parsed.success) return null
    return <LineChartRenderer input={parsed.data} />
  },
  show_donut_chart: (input) => {
    const parsed = GEN_UI_TOOLS.show_donut_chart.safeParse(input)
    if (!parsed.success) return null
    return <DonutChartRenderer input={parsed.data} />
  },
}

const TOOL_NAMES = new Set<string>(Object.keys(GEN_UI_TOOLS))

export function isGenUiTool(typeOrName: string): boolean {
  const name = typeOrName.startsWith('tool-')
    ? typeOrName.slice('tool-'.length)
    : typeOrName
  return TOOL_NAMES.has(name)
}

export function renderGenUi(
  typeOrName: string,
  input: unknown,
): React.ReactElement | null {
  const name = typeOrName.startsWith('tool-')
    ? typeOrName.slice('tool-'.length)
    : typeOrName
  if (!TOOL_NAMES.has(name)) return null
  return RENDERERS[name as GenUiToolName](input)
}
