import { tool } from 'ai'
import { z } from 'zod'
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

export type StatementBlob = { filename: string; text: string }

// Server tool: fetch a previously-uploaded statement's raw text inline. The
// fetcher is injected (no DO closure) so the tool is shareable across agents
// and DOs. The result text enters the conversation directly, so the model can
// extract Beancount and call draft_transaction in the SAME turn — no worker
// round-trip, no follow-up system message.
export function readStatementTool(
  fetchStatement: (id: string) => Promise<StatementBlob | null>,
) {
  return tool({
    description:
      'Read the full text of a previously-uploaded statement. Pass the exact `statement_id` from the `<statement id="STMT-…" filename="…" />` reference in the user message. Returns `{ ok: true, filename, text }` with the raw statement text inline — extract the transactions from it and call `draft_transaction` in this same turn. Returns `{ ok: false, error: "not_found" }` if the id is unknown (tell the user briefly and stop).',
    inputSchema: z.object({
      statement_id: z
        .string()
        .regex(/^STMT-/, 'statement_id must start with "STMT-"'),
    }),
    execute: async ({ statement_id }) => {
      const blob = await fetchStatement(statement_id)
      if (!blob) return { ok: false as const, error: 'not_found' as const }
      return { ok: true as const, filename: blob.filename, text: blob.text }
    },
  })
}
