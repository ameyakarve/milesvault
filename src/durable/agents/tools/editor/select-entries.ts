import { dynamicTool, type ToolExecuteFunction } from 'ai'
import { selectEntriesInputSchema } from '../../../agent-ui-schemas'

// CLIENT tool — like draft_transaction, no runtime execute: the SDK loop
// suspends until the UI resolves it (the user's ticked ids) via addToolResult.
const SUSPENDING_EXECUTE = undefined as unknown as ToolExecuteFunction<unknown, unknown>

export function selectEntriesTool() {
  return dynamicTool({
    description:
      'Ask the user to pick which existing entries to edit or delete, when a query_sql search matched MORE than ~10 — too many to act on blindly. Pass `candidates` as { id, title } built from your query_sql rows (id = transactions.id; title = a readable one-liner). Returns { ids } — the ids the user ticked. Then call get_entry for each chosen id and draft the edits/deletes. Do NOT use this for 1–10 matches (just draft those) or as a yes/no question (that is `clarify`).',
    inputSchema: selectEntriesInputSchema,
    execute: SUSPENDING_EXECUTE,
  })
}
