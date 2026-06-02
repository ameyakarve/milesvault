import { dynamicTool, type ToolExecuteFunction } from 'ai'
import { z } from 'zod'

// CLIENT tool — suspends until the user types an answer in the chat.
// Pure text in, pure text out. NO chip options, NO multi-select, no
// genUI of any kind — the question renders as text and the user's next
// chat message becomes the answer. Use when an account name or other
// piece of context is genuinely ambiguous and a quick "which one?"
// turn-around unblocks the rest of the answer.
//
// dynamicTool + undefined execute is the AI SDK pattern for suspending
// tool calls. See draft-transaction.ts in the editor surface.

const SUSPENDING_EXECUTE = undefined as unknown as ToolExecuteFunction<
  unknown,
  unknown
>

export const askUserInputSchema = z.object({
  question: z
    .string()
    .min(1, 'question is required')
    .describe(
      'A single short clarifying question for the user. Plain text — no markdown, no options, no formatting hints. One sentence is best.',
    ),
})

export function askUserTool() {
  return dynamicTool({
    description:
      'Ask the user one short clarifying question in plain text when the request is genuinely ambiguous and the answer would meaningfully change your response. Provide a single concrete question; the user replies in the chat textbox and you receive { answer: string } as the tool result, then continue. Do not use for stylistic preferences or to pad turns — only when you cannot answer without the clarification.',
    inputSchema: askUserInputSchema,
    execute: SUSPENDING_EXECUTE,
  })
}
