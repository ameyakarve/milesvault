import type { LanguageModel, ToolSet } from 'ai'

// A single persona the conversation can run under. The builders are closures
// over the host DO (so an agent can read the live snapshot, dispatch tasks,
// etc.) — the registry only names agents and declares the handoff graph.
export interface AgentDef {
  readonly name: string
  // Agents this one may hand the conversation off to. Empty = terminal.
  readonly canHandoffTo: readonly string[]
  system(): string
  tools(): ToolSet
  model(): LanguageModel
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
