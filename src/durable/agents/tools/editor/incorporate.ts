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
      'Apply the user\'s request to ADD, EDIT, or DELETE journal entries. Pass the user\'s request verbatim as `intent`. It locates the affected dates, reconciles each day\'s entries with the request, and returns `{ ok: true, entries: [{ id, text?, replaces? }] }` — the proposed changes (add = text; delete/edited-away = replaces). Then call `draft_transaction` with EXACTLY those entries (verbatim) so the user can review and approve. If `{ ok: true, entries: [] }`, nothing needed changing — tell the user briefly. Use this for any change to existing entries; do not hand-write edits or hunt for entries yourself.',
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
