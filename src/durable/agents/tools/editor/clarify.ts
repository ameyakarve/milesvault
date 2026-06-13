import { dynamicTool, type ToolExecuteFunction } from 'ai'
import { clarifyInputSchema } from '../../../agent-ui-schemas'

// CLIENT tool — suspends until the user answers. See draft-transaction.ts for
// the rationale on dynamicTool + undefined execute.

const SUSPENDING_EXECUTE = undefined as unknown as ToolExecuteFunction<
  unknown,
  unknown
>

// Generic mechanism only — no domain knowledge. This describes HOW clarify
// works for any caller. WHEN to use it for a particular domain (which choices
// are ambiguous, what to ask) is domain-specific and is injected by the caller
// via `domainHints` at construction — never hard-coded here.
const CORE_DESCRIPTION =
  'Ask the user ONE short, focused question when a required choice is genuinely ambiguous and you cannot sensibly default. ' +
  'Provide `options` as short chips for discrete choices, or leave `options` empty for a free-text answer; ' +
  'set `multi_select: true` for "all that apply"; set `allow_custom: false` only when free text would not make sense. ' +
  'Your `question` renders as MARKDOWN — when it covers several parts or items, format it (a short table or a list) so it is easy to read; use your judgement on the format. ' +
  'Use sparingly. After the user answers you receive { answers: string[] } — then proceed.'

// `domainHints` is the caller's domain-specific guidance on WHEN/what to clarify
// (e.g. the ledger editor's reward/redemption scenarios). Passed at construction
// so the core tool stays generic and reusable across surfaces.
export function clarifyTool(domainHints?: string) {
  return dynamicTool({
    description: domainHints ? `${CORE_DESCRIPTION}\n\n${domainHints.trim()}` : CORE_DESCRIPTION,
    inputSchema: clarifyInputSchema,
    execute: SUSPENDING_EXECUTE,
  })
}
