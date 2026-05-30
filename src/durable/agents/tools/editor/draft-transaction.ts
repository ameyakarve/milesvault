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
      'Propose one or more beancount transactions for the user to review and approve. Always pass an array under `transactions` — a one-off entry is just a batch of length 1. Batch related entries (statement uploads, splits across categories, subscription series) into a single call; the user pages through them and approves the whole batch at once. Input is validated server-side (parse + per-currency balance + account shape); on validation failure you will receive a tool-error describing each bad entry by index — fix the listed entries and call this tool again in the same turn. Do NOT narrate the proposal in prose, do NOT invent file paths, do NOT pretend you have already written to the journal — just call this tool with the structured fields.',
    inputSchema: draftTransactionBatchSchema,
    execute: SUSPENDING_EXECUTE,
  })
}
