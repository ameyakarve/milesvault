import { dynamicTool, type ToolExecuteFunction } from 'ai'
import { clarifyInputSchema } from '../../../agent-ui-schemas'

// CLIENT tool — suspends until the user picks options. See draft-transaction.ts
// for the rationale on dynamicTool + undefined execute.

const SUSPENDING_EXECUTE = undefined as unknown as ToolExecuteFunction<
  unknown,
  unknown
>

export function clarifyTool() {
  return dynamicTool({
    description:
      'Ask the user one short clarifying question when a required accounting choice is genuinely ambiguous (e.g. instant discount vs separately-redeemable cashback). Provide suggested `options` as short chips; set `multi_select: true` for "all that apply"; set `allow_custom: false` only when free text would not make sense. After the user answers, you will receive { answers: string[] } as the tool result — then proceed (typically to draft_transaction).',
    inputSchema: clarifyInputSchema,
    execute: SUSPENDING_EXECUTE,
  })
}
