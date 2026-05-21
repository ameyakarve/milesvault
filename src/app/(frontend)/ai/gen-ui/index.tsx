'use client'

import { GEN_UI_TOOLS, type GenUiToolName } from '@/durable/agent-ui-schemas'
import { StackedBar } from './stacked-bar'

const RENDERERS: {
  [K in GenUiToolName]: (input: unknown) => React.ReactElement | null
} = {
  show_stacked_bar: (input) => {
    const parsed = GEN_UI_TOOLS.show_stacked_bar.safeParse(input)
    if (!parsed.success) return null
    return <StackedBar input={parsed.data} />
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
