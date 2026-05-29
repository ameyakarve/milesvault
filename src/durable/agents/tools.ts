import { tool } from 'ai'
import {
  clarifyInputSchema,
  draftTransactionBatchSchema,
} from '../agent-ui-schemas'

// Client-side tools shared by multiple agents (ledger + statement). Both have
// NO `execute` → the agent loop suspends until the UI resolves them via
// addToolResult. Kept here so every persona that drafts or clarifies uses the
// identical schema + description.

export function draftTransactionTool() {
  return tool({
    description:
      'Propose one or more beancount transactions for the user to review and approve. Always pass an array under `transactions` — a one-off entry is just a batch of length 1. Batch related entries (statement uploads, splits across categories, subscription series) into a single call; the user pages through them and approves the whole batch at once. Do NOT narrate the proposal in prose, do NOT invent file paths, do NOT pretend you have already written to the journal — just call this tool with the structured fields.',
    inputSchema: draftTransactionBatchSchema,
  })
}

export function clarifyTool() {
  return tool({
    description:
      'Ask the user one short clarifying question when a required accounting choice is genuinely ambiguous (e.g. instant discount vs separately-redeemable cashback). Provide suggested `options` as short chips; set `multi_select: true` for "all that apply"; set `allow_custom: false` only when free text would not make sense. After the user answers, you will receive { answers: string[] } as the tool result — then proceed (typically to draft_transaction).',
    inputSchema: clarifyInputSchema,
  })
}
