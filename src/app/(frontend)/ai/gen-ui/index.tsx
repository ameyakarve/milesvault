'use client'

import { DraftTransactionBatchCard } from './draft-transaction'
import { ClarifyCard } from './clarify'
import {
  clarifyInputSchema,
  draftTransactionBatchSchema,
  type ClarifyInput,
  type DraftTransaction,
} from '@/durable/agent-ui-schemas'

export type GenUiProps = {
  accounts?: string[]
  // Card status — same shape for both tools; cards only use what applies.
  status?: 'idle' | 'submitting' | 'done' | 'failed' | 'rejected'
  errorMessage?: string
  // For draft_transaction
  onApprove?: (final: DraftTransaction[]) => void
  // For clarify
  resolvedAnswers?: string[]
  onAnswer?: (answers: string[]) => void
  // Both
  onReject: () => void
}

const noop = () => {}

// Persisted chat history from before the batch schema landed has draft
// transactions stored flat — { date, postings, ... } at the top level.
// Wrap that shape so the new batch parser accepts it. Streaming inputs
// (partial JSON) just fail parsing and render as "Preparing…", same as
// they did before.
function normalizeDraftTxnInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input
  if ('transactions' in input) return input
  if ('postings' in input || 'date' in input) {
    return { transactions: [input] }
  }
  return input
}

const RENDERERS: Record<
  string,
  (input: unknown, props: GenUiProps) => React.ReactElement | null
> = {
  draft_transaction: (input, props) => {
    const parsed = draftTransactionBatchSchema.safeParse(
      normalizeDraftTxnInput(input),
    )
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
