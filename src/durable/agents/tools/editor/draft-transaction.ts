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
      'Propose one or more journal entries for the user to review and approve, as STRUCTURED data under `entries` (NOT beancount text). Each entry has a unique short `id` and is ONE of:\n' +
      '• a transaction: { "id", "kind":"transaction", "date":"YYYY-MM-DD", "flag"?:"*"|"!", "payee"?, "narration"?, "tags"?:[...], "postings":[ 2 or more { "account", "amount", "currency", "price_at_signs"?:0|1|2, "price_amount"?, "price_currency"? } ] }\n' +
      '• a balance assertion: { "id", "kind":"balance", "date", "account", "amount", "currency" }\n' +
      '• a pad+balance (lets a pad absorb drift up to the figure): { "id", "kind":"pad", "date", "account", "amount", "currency" }\n' +
      'Postings must balance per currency. For a foreign-currency or points→points conversion, set `price_at_signs:2` (= `@@`, total price) with `price_amount`/`price_currency` — the price is denominated in the OTHER commodity (e.g. a 150→150 points transfer: the destination leg is `amount:150, currency:DEST, price_at_signs:2, price_amount:150, price_currency:SRC`). Batch related entries (statement uploads, splits, subscription series) into one call. On validation failure you get a compact tool-result naming the bad entries with a worked example — fix only those and call again in the same turn. Do NOT write beancount text, do NOT narrate, do NOT invent file paths.',
    inputSchema: draftTransactionBatchSchema,
    execute: SUSPENDING_EXECUTE,
  })
}
