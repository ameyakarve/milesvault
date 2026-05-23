'use client'

import { GEN_UI_TOOLS, type GenUiToolName } from '@/durable/agent-ui-schemas'
import { VegaChart } from './vega'
import { AccountCard } from './account-card'
import { StatementRows } from './statement-rows'
import { DiffCard } from './diff-card'

const RENDERERS: {
  [K in GenUiToolName]: (input: unknown) => React.ReactElement | null
} = {
  show_vega: (input) => {
    const parsed = GEN_UI_TOOLS.show_vega.safeParse(input)
    if (!parsed.success) return null
    return <VegaChart input={parsed.data} />
  },
  show_account_card: (input) => {
    const parsed = GEN_UI_TOOLS.show_account_card.safeParse(input)
    if (!parsed.success) return null
    return <AccountCard input={parsed.data} />
  },
  extract_statement_rows: (input) => {
    const parsed = GEN_UI_TOOLS.extract_statement_rows.safeParse(input)
    if (!parsed.success) return null
    return <StatementRows input={parsed.data} />
  },
  propose_journal_edit: (input) => {
    const parsed = GEN_UI_TOOLS.propose_journal_edit.safeParse(input)
    if (!parsed.success) return null
    return <DiffCard input={parsed.data} />
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
