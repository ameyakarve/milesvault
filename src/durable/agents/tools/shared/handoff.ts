import { tool } from 'ai'
import { z } from 'zod'

// Result the host returns from a handoff attempt. On an edge the graph
// doesn't allow, `ok: false` lets the model self-correct rather than
// teleporting the conversation somewhere invalid.
export type HandoffResult =
  | { ok: true; handed_off_to: string }
  | { ok: false; error: 'invalid_target'; allowed: string[] }

// A single, globally-registered handoff tool. Its `to` enum spans every agent
// in the registry (AI SDK can't swap a tool's schema per step, so we can't
// scope the enum per active agent); the host's `onHandoff` enforces the
// per-agent handoff graph and rejects edges the active agent can't take. The
// active agent's system prompt names its own valid targets.
export function makeHandoffTool(
  allAgentNames: readonly string[],
  onHandoff: (to: string, context: string) => HandoffResult | Promise<HandoffResult>,
) {
  const names = allAgentNames as [string, ...string[]]
  return tool({
    description:
      'Hand the live conversation to another specialist agent. Call this when the user\'s need is better served by a different agent than you. Pass `to` (the target agent) and `context` (everything the next agent needs to continue — what the user wants, relevant ids, decisions so far). After this call the named agent takes over and continues immediately; do not also answer the request yourself.',
    inputSchema: z.object({
      to: z.enum(names),
      context: z
        .string()
        .describe('The overall context the next agent needs to continue.'),
    }),
    execute: async ({ to, context }) => onHandoff(to, context),
  })
}
