import type { AgentDef, AgentHost, Registry } from '../types'

// Workers AI model id. The analyst runs Kimi (freeform reasoning over SQL
// results) at low reasoning effort — questions are usually shallow ("how
// much did I spend on X"), not multi-step analytic dives.
const ANALYST_MODEL_ID = '@cf/moonshotai/kimi-k2.6'

export type ConciergeAgentName = 'analyst'

// The `/concierge` surface. Read-only Q&A over the user's ledger. Today the
// registry hosts a single `analyst` agent (entry, canHandoffTo:[]), but the
// framework is unchanged — additional specialists (e.g. `points`, `taxes`)
// can be added later and the analyst's `canHandoffTo` extended.
export function makeConciergeRegistry(
  host: AgentHost<ConciergeAgentName>,
): Registry {
  const analyst: AgentDef = {
    name: 'analyst',
    canHandoffTo: [],
    model: { id: ANALYST_MODEL_ID, reasoning: 'low' },
    system: () => host.system('analyst'),
    tools: () => host.tools('analyst'),
  }
  return {
    name: 'concierge',
    entry: 'analyst',
    agents: { analyst },
  }
}
