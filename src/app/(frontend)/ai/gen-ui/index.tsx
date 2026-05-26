'use client'

import { DraftTransactionCard } from './draft-transaction'
import { ClarifyCard } from './clarify'
import {
  clarifyInputSchema,
  draftTransactionSchema,
  type ClarifyInput,
  type DraftTransaction,
} from '@/durable/agent-ui-schemas'

export type GenUiProps = {
  accounts?: string[]
  // Card status — same shape for both tools; cards only use what applies.
  status?: 'idle' | 'submitting' | 'done' | 'failed' | 'rejected'
  errorMessage?: string
  // For draft_transaction
  onApprove?: (final: DraftTransaction) => void
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
    const parsed = draftTransactionSchema.safeParse(input)
    if (!parsed.success) return null
    return (
      <DraftTransactionCard
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

const stripPrefix = (s: string) => (s.startsWith('tool-') ? s.slice(5) : s)

export function isGenUiTool(typeOrName: string): boolean {
  return stripPrefix(typeOrName) in RENDERERS
}

export function renderGenUi(
  typeOrName: string,
  input: unknown,
  props: GenUiProps,
): React.ReactElement | null {
  const fn = RENDERERS[stripPrefix(typeOrName)]
  return fn ? fn(input, props) : null
}
