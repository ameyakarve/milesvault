import type { ToolSet } from 'ai'
import type { AgentDef, AgentState, Registry } from './types'

// Resolve the agent that currently owns the conversation. Defaults to the
// registry's entry agent when state is unset (fresh session) or names an
// agent the registry doesn't define (stale config after a roster change).
export function resolveActiveAgent(
  registry: Registry,
  state: AgentState | null,
): AgentDef {
  const name = state?.activeAgent ?? registry.entry
  return registry.agents[name] ?? registry.agents[registry.entry]
}

// Union of every agent's tools. Think registers this whole set so the SDK
// knows them all; per-turn `activeTools` (set in beforeTurn) then gates which
// the active agent may actually call.
export function unionTools(registry: Registry): ToolSet {
  const merged: ToolSet = {}
  for (const agent of Object.values(registry.agents)) {
    Object.assign(merged, agent.tools())
  }
  return merged
}

export const HANDOFF_TOOL_NAME = 'handoff'

export function allAgentNames(registry: Registry): string[] {
  return Object.keys(registry.agents)
}

// Tools the active agent may call this turn: its own tools, plus the global
// handoff tool when its handoff graph has any outgoing edge.
export function activeToolNames(agent: AgentDef): string[] {
  const names = Object.keys(agent.tools())
  if (agent.canHandoffTo.length > 0) names.push(HANDOFF_TOOL_NAME)
  return names
}
