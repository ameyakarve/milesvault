import { tool } from 'ai'
import { z } from 'zod'

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
      'Read the full text of a previously-uploaded statement. Pass the exact `statement_id` from the `<statement id="STMT-…" filename="…" />` reference in the user message. Returns `{ ok: true, filename, text }` with the raw statement text inline — for a card statement, call `card_guide` next, then call `draft_transaction` in this same turn with the extracted entries INCLUDING the reward accrual the guide describes (the batch is incomplete without it). Returns `{ ok: false, error: "not_found" }` if the id is unknown (tell the user briefly and stop).',
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
