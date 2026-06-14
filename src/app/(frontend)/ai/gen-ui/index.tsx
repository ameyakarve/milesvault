'use client'

import { DraftTransactionBatchCard, type DraftOp } from './draft-transaction'
import { ClarifyCard } from './clarify'
import { AddCardCard, type AddCardResult } from './add-card'
import { ExploreLinkCard } from './explore-link'
import {
  addCardInputSchema,
  clarifyInputSchema,
  showAwardOptionsSchema,
  type DraftTransactionBatch,
} from '@/durable/agent-ui-schemas'

export type GenUiProps = {
  accounts?: string[]
  // Card status — same shape for both tools; cards only use what applies.
  status?: 'idle' | 'submitting' | 'done' | 'failed' | 'rejected'
  errorMessage?: string
  // For draft_transaction
  onApprove?: (ops: DraftOp[], meta: { approved: number; skipped: number }) => void
  onShowInJournal?: (range: { from: string; to: string } | null) => void
  // For clarify
  resolvedAnswers?: string[]
  onAnswer?: (answers: string[]) => void
  // For add_card — the confirmed selection becomes the tool output.
  onAddCard?: (result: AddCardResult) => void
  // Both
  onReject: () => void
}

const noop = () => {}

const RENDERERS: Record<
  string,
  (input: unknown, props: GenUiProps) => React.ReactElement | null
> = {
  draft_transaction: (input, props) => {
    // `input` is the tool-call args the server already validated (the tool only
    // suspends on valid input): { entries: [{ id, text }] } where text is one
    // beancount entry. Confirm the shape and pass it through; the card edits the
    // text directly.
    const entries = (input as { entries?: unknown } | null)?.entries
    if (!Array.isArray(entries) || entries.length === 0) return null
    return (
      <DraftTransactionBatchCard
        input={{ entries } as DraftTransactionBatch}
        accounts={props.accounts}
        status={
          props.status === 'idle' || props.status === undefined
            ? 'idle'
            : props.status
        }
        errorMessage={props.errorMessage}
        onApprove={props.onApprove ?? noop}
        onReject={props.onReject}
        onShowInJournal={props.onShowInJournal}
      />
    )
  },
  // incorporate's OUTPUT (not input) carries the proposed entries — the chat
  // passes p.output here. Render the same review card; no model relay involved.
  incorporate: (output, props) => {
    const out = output as { ok?: boolean; entries?: unknown } | null
    if (!out || out.ok !== true) return null
    const entries = Array.isArray(out.entries) ? out.entries : []
    if (entries.length === 0) return null
    return (
      <DraftTransactionBatchCard
        input={{ entries } as DraftTransactionBatch}
        accounts={props.accounts}
        status={props.status === 'idle' || props.status === undefined ? 'idle' : props.status}
        errorMessage={props.errorMessage}
        onApprove={props.onApprove ?? noop}
        onReject={props.onReject}
        onShowInJournal={props.onShowInJournal}
      />
    )
  },
  show_award_options: (input) => {
    const parsed = showAwardOptionsSchema.safeParse(input)
    if (!parsed.success) return null
    return <ExploreLinkCard input={parsed.data} />
  },
  add_card: (input, props) => {
    const parsed = addCardInputSchema.safeParse(input)
    if (!parsed.success) return null
    return (
      <AddCardCard
        input={parsed.data}
        status={props.status}
        onResult={props.onAddCard}
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
