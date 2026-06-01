import type { AgentDef, AgentHost, Registry } from '../types'

// Workers AI model ids.
//
// The analyst runs Kimi (freeform reasoning over SQL results) at low effort
// — questions are usually shallow ("how much did I spend on X"), not deep
// analytic dives.
//
// The graph-walker runs Gemma with the thinking trace OFF and a tight step
// budget. Graph traversal is deterministic ("resolve, get, related, done");
// reasoning tokens are mostly waste here.
const ANALYST_MODEL_ID = '@cf/moonshotai/kimi-k2.6'
const GRAPH_WALKER_MODEL_ID = '@cf/google/gemma-4-26b-a4b-it'

export type ConciergeAgentName = 'analyst' | 'graph-walker'

// The `/concierge` surface. Read-only Q&A — over the user's ledger
// (`analyst`) or the knowledge graph (`graph-walker`). Either can hand off
// to the other when the question shifts domain.
export function makeConciergeRegistry(
  host: AgentHost<ConciergeAgentName>,
): Registry {
  const analyst: AgentDef = {
    name: 'analyst',
    canHandoffTo: ['graph-walker'],
    model: { id: ANALYST_MODEL_ID, reasoning: 'low' },
    system: () => host.system('analyst'),
    tools: () => host.tools('analyst'),
  }
  const graphWalker: AgentDef = {
    name: 'graph-walker',
    canHandoffTo: ['analyst'],
    model: { id: GRAPH_WALKER_MODEL_ID, reasoning: 'off', maxSteps: 5 },
    system: () => host.system('graph-walker'),
    tools: () => host.tools('graph-walker'),
  }
  return {
    name: 'concierge',
    // graph-walker is the default — most concierge questions are about the
    // points/miles world (cards, transfer partners, alliances) rather than
    // the user's personal ledger numbers. It hands off to analyst when the
    // question turns out to be about the user's own data.
    entry: 'graph-walker',
    agents: { analyst, 'graph-walker': graphWalker },
  }
}
