import { tool } from 'ai'
import { z } from 'zod'
import { validateDraftBatch } from '@/lib/beancount/validate-draft-batch'
import {
  clarifyInputSchema,
  draftTransactionBatchSchema,
} from '../agent-ui-schemas'

// Shared tools used by multiple agents (ledger + statement). `clarify` has no
// `execute` → the agent loop suspends until the UI resolves it via
// addToolResult. `draft_transaction` has a server-side `execute` that runs the
// same validators (`@/lib/beancount/*`) the journal write path runs, so the
// model can't emit a draft that won't persist. On `ok: true` the UI still
// shows an approval card (rendered from the streamed input); on `ok: false`
// the model sees per-entry issues and re-drafts in the same turn.

export function draftTransactionTool() {
  return tool({
    description:
      'Propose one or more beancount transactions for the user to review and approve. Always pass an array under `transactions` — a one-off entry is just a batch of length 1. Batch related entries (statement uploads, splits across categories, subscription series) into a single call; the user pages through them and approves the whole batch at once. The server validates each entry (parse + per-currency balance + account shape) and returns `{ ok: false, issues: [{ index, message }] }` if anything is wrong — fix the listed entries and call this tool again in the same turn. On success returns `{ ok: true, pending_approval: true }` and the user approves the batch in the UI. Do NOT narrate the proposal in prose, do NOT invent file paths, do NOT pretend you have already written to the journal — just call this tool with the structured fields.',
    inputSchema: draftTransactionBatchSchema,
    execute: async ({ transactions }) => {
      const result = validateDraftBatch(transactions)
      if (result.ok === false) {
        return {
          ok: false as const,
          issues: result.issues,
          message:
            'draft_transaction rejected — fix the listed entries (each `index` is 0-based into the `transactions` array you sent) and call draft_transaction again with the corrected batch.',
        }
      }
      return {
        ok: true as const,
        pending_approval: true,
        transaction_count: transactions.length,
      }
    },
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
