'use client'

import { DraftTransactionCard, type DraftTransactionCardProps } from './draft-transaction'
import { draftTransactionSchema } from '@/durable/agent-ui-schemas'

const RENDERERS: Record<
  string,
  (input: unknown, props: Omit<DraftTransactionCardProps, 'input'>) => React.ReactElement | null
> = {
  draft_transaction: (input, props) => {
    const parsed = draftTransactionSchema.safeParse(input)
    if (!parsed.success) return null
    return <DraftTransactionCard input={parsed.data} {...props} />
  },
}

const stripPrefix = (s: string) => (s.startsWith('tool-') ? s.slice(5) : s)

export function isGenUiTool(typeOrName: string): boolean {
  return stripPrefix(typeOrName) in RENDERERS
}

export function renderGenUi(
  typeOrName: string,
  input: unknown,
  props: Omit<DraftTransactionCardProps, 'input'>,
): React.ReactElement | null {
  const fn = RENDERERS[stripPrefix(typeOrName)]
  return fn ? fn(input, props) : null
}
