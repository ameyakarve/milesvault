import type { ToolSet } from 'ai'

// Declarative model choice for an agent. `reasoning` is intent, not a wire
// value: 'low'|'medium'|'high' map to reasoning_effort; 'off' disables the
// thinking trace (the host translates this to the model's chat-template flag,
// since reasoning_effort:null is a no-op on Kimi/GLM).
export interface ModelConfig {
  readonly id: string
  readonly reasoning: 'low' | 'medium' | 'high' | 'off'
  // Per-agent override on the per-turn step cap. Think's default is 10;
  // agents doing focused multi-hop work can tighten this. Omit to inherit
  // the default.
  readonly maxSteps?: number
}

// A single persona the conversation can run under. The builders are closures
// over the host DO (so an agent can read the live snapshot, dispatch tasks,
// etc.) — the registry only names agents and declares the handoff graph.
export interface AgentDef {
  readonly name: string
  // Agents this one may hand the conversation off to. Empty = terminal.
  readonly canHandoffTo: readonly string[]
  // Model choice is plain data, owned by the agent definition.
  readonly model: ModelConfig
  system(): string
  tools(): ToolSet
}

// A named roster + handoff graph + entry agent. One registry per product
// surface (editor, concierge, …). A DO instance serves exactly one registry.
export interface Registry {
  readonly name: string
  readonly entry: string
  readonly agents: Readonly<Record<string, AgentDef>>
}

// Persisted via Think's configure()/getConfig(); survives eviction. Holds
// which agent currently owns the conversation and the context the previous
// agent handed forward.
export interface AgentState {
  activeAgent: string
  handoffContext?: string
}

// What a DO supplies to a registry: per-agent system prompt + tool set,
// keyed by the registry's agent-name union. The DO closes over its live
// state (snapshot, fetchers); the registry stays a pure data wiring file.
// Generic over the name union so each product (editor, concierge, …)
// declares its own agent vocabulary and the runtime stays unaware.
export interface AgentHost<N extends string> {
  system(name: N): string
  tools(name: N): ToolSet
}
