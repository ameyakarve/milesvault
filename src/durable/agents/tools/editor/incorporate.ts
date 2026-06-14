import { tool } from 'ai'
import { z } from 'zod'
import type { IncorporationOp } from '../../../ingest/incorporate'

// Server tool: apply the user's add/edit/delete request to the existing ledger
// by date-bucketed incorporation, returning the proposed changes as draft
// entries. The runner is injected (no DO closure). The model relays the
// returned entries straight into draft_transaction (same pattern as
// read_statement -> draft_transaction) so the user gets the diff card.
export function incorporateTool(
  run: (intent: string) => Promise<{ ops: IncorporationOp[]; dates: string[]; error: string | null }>,
) {
  return tool({
    description:
      'Apply the user\'s request to ADD, EDIT, or DELETE journal entries. Pass the user\'s request verbatim as `intent`. It locates the affected dates, reconciles each day\'s entries with the request, and proposes the changes — which are shown to the user as a review card AUTOMATICALLY. You do NOT re-emit or relay the result anywhere; after calling this, just stop (or one short sentence like "Review the proposed changes"). If it reports nothing changed, tell the user briefly. Use this for ANY change to entries.',
    inputSchema: z.object({
      intent: z
        .string()
        .min(1)
        .describe("The user's add/edit/delete request, verbatim."),
    }),
    execute: async ({ intent }) => {
      const r = await run(intent)
      if (r.error && r.ops.length === 0) return { ok: false as const, error: r.error }
      return { ok: true as const, entries: r.ops, dates: r.dates }
    },
  })
}
