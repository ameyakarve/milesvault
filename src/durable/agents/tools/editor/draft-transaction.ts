import { dynamicTool, type ToolExecuteFunction } from 'ai'
import { draftTransactionBatchSchema } from '../../../agent-ui-schemas'

// CLIENT tool — no runtime `execute`, the SDK loop suspends after the call
// until the UI resolves it via addToolResult (approve / reject). Registered
// with `dynamicTool` (not `tool`) on purpose: the AI SDK silently drops
// invalid input for static client tools, but surfaces a `tool-error` to the
// model for dynamic ones (parseToolCall in ai/dist/index.mjs:4521). Validation
// lives in `draftTransactionBatchSchema.superRefine` (same `validateDraftBatch`
// used by replaceBuffer at the journal-write boundary) — on bad input the
// model gets per-entry issues back and re-emits in the same turn, without an
// empty approval card cluttering history.
//
// `dynamicTool`'s TypeScript signature requires `execute`, but the runtime
// (executeToolCall: `if (tool?.execute == null) return void 0`) short-circuits
// on a literally-undefined execute. We provide `undefined` cast to the
// expected type to keep the suspending behavior while satisfying the compiler.

const SUSPENDING_EXECUTE = undefined as unknown as ToolExecuteFunction<
  unknown,
  unknown
>

export function draftTransactionTool() {
  return dynamicTool({
    description:
      'Propose one or more journal entries for the user to review and approve. `entries` is an array; each element is { "id", "text" } where `text` is ONE beancount entry and `id` is a short unique handle (used only to address the entry on a correction — it is never written to the ledger). Each `text` is ONE of:\n' +
      '• a transaction — a date header then 2+ posting lines:\n' +
      '    2026-05-21 * "Payee" "Narration"\n' +
      '      Expenses:Food:Groceries     42.10 USD\n' +
      '      Assets:Bank:Chase:Checking -42.10 USD\n' +
      '• a balance assertion: `2026-06-12 balance Assets:Bank:Chase:Checking  100.00 USD`\n' +
      '• a pad+balance (lets a pad absorb drift up to the figure) — two lines, plug always Equity:Void:\n' +
      '    2026-06-12 pad Assets:Bank:Chase:Checking Equity:Void\n' +
      '    2026-06-12 balance Assets:Bank:Chase:Checking  100.00 USD\n' +
      'Every posting needs an explicit amount and currency (no blanks), and postings must balance per currency. For a foreign-currency or points→points conversion, carry a total price with `@@` in the OTHER commodity (e.g. a 150→150 points transfer: `Assets:Rewards:...:Dest 150 DEST @@ 150 SRC`). Batch related entries (statement uploads, splits, subscription series) into one call. On validation failure you get a compact tool-result naming the bad entries with a worked example — fix only those and call again in the same turn. Do NOT narrate, do NOT invent file paths.',
    inputSchema: draftTransactionBatchSchema,
    execute: SUSPENDING_EXECUTE,
  })
}
