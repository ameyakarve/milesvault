import { dynamicTool, tool, type ToolExecuteFunction } from 'ai'
import { z } from 'zod'
import {
  clarifyInputSchema,
  draftTransactionBatchSchema,
} from '../agent-ui-schemas'

// Shared tools used by multiple agents (ledger + statement).
//
// `draft_transaction` and `clarify` are CLIENT tools — they have no runtime
// `execute`, so the SDK loop suspends after the call until the UI resolves
// them via addToolResult (approve / reject / answer). They're registered with
// `dynamicTool` (not `tool`) on purpose: the AI SDK silently drops invalid
// input for static client tools, but surfaces a `tool-error` to the model for
// dynamic ones (parseToolCall in ai/dist/index.mjs:4521). Validation lives in
// `draftTransactionBatchSchema.superRefine` (same `validateDraftBatch` used
// by replaceBuffer at the journal-write boundary) — on bad input the model
// gets per-entry issues back and re-emits in the same turn, without an empty
// approval card cluttering history.
//
// `dynamicTool`'s TypeScript signature requires `execute`, but the runtime
// (executeToolCall: `if (tool?.execute == null) return void 0`) short-circuits
// on a literally-undefined execute. We provide `undefined` cast to the expected
// type to keep the suspending behavior while satisfying the compiler.
//
// `read_statement` below is a SERVER tool (real `execute`) — it runs inline,
// returns the raw statement text, and lets the model continue to
// draft_transaction in the same turn.

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

export function clarifyTool() {
  return dynamicTool({
    description:
      'Ask the user one short clarifying question when a required accounting choice is genuinely ambiguous (e.g. instant discount vs separately-redeemable cashback). Provide suggested `options` as short chips; set `multi_select: true` for "all that apply"; set `allow_custom: false` only when free text would not make sense. After the user answers, you will receive { answers: string[] } as the tool result — then proceed (typically to draft_transaction).',
    inputSchema: clarifyInputSchema,
    execute: SUSPENDING_EXECUTE,
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
