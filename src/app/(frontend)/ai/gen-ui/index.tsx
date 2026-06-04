'use client'

import { DraftTransactionBatchCard } from './draft-transaction'
import { ClarifyCard } from './clarify'
import { AwardOptionsCard } from './award-options'
import {
  clarifyInputSchema,
  draftTransactionBatchSchema,
  showAwardOptionsSchema,
} from '@/durable/agent-ui-schemas'

export type GenUiProps = {
  accounts?: string[]
  // Card status — same shape for both tools; cards only use what applies.
  status?: 'idle' | 'submitting' | 'done' | 'failed' | 'rejected'
  errorMessage?: string
  // For draft_transaction
  onApprove?: (finalText: string) => void
  // For clarify
  resolvedAnswers?: string[]
  onAnswer?: (answers: string[]) => void
  // Both
  onReject: () => void
}

const noop = () => {}

const RENDERERS: Record<
  string,
  (input: unknown, props: GenUiProps) => React.ReactElement | null
> = {
  draft_transaction: (input, props) => {
    const parsed = draftTransactionBatchSchema.safeParse(input)
    if (!parsed.success) return null
    return (
      <DraftTransactionBatchCard
        input={parsed.data}
        accounts={props.accounts}
        status={
          props.status === 'idle' || props.status === undefined
            ? 'idle'
            : props.status
        }
        errorMessage={props.errorMessage}
        onApprove={props.onApprove ?? noop}
        onReject={props.onReject}
      />
    )
  },
  show_award_options: (input) => {
    const parsed = showAwardOptionsSchema.safeParse(input)
    if (!parsed.success) return null
    return <AwardOptionsCard input={parsed.data} />
  },
  clarify: (input, props) => {
    const parsed = clarifyInputSchema.safeParse(input)
    if (!parsed.success) return null
    const status: 'idle' | 'done' | 'rejected' =
      props.status === 'done'
        ? 'done'
        : props.status === 'rejected'
          ? 'rejected'
          : 'idle'
    return (
      <ClarifyCard
        input={parsed.data}
        status={status}
        resolvedAnswers={props.resolvedAnswers}
        onAnswer={props.onAnswer ?? noop}
        onReject={props.onReject}
      />
    )
  },
}

// Caller passes the resolved tool name (e.g. "draft_transaction"). Static tool
// parts have type `tool-<name>`, dynamic tool parts have type `dynamic-tool`
// with a separate `toolName` field — chat.tsx normalizes via getToolName(part)
// before calling in.
export function isGenUiTool(toolName: string): boolean {
  return toolName in RENDERERS
}

export function renderGenUi(
  toolName: string,
  input: unknown,
  props: GenUiProps,
): React.ReactElement | null {
  const fn = RENDERERS[toolName]
  return fn ? fn(input, props) : null
}
