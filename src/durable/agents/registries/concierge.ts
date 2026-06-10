import type { AgentDef, AgentHost, Registry } from '../types'

// Workers AI model ids.
//
// The analyst runs Kimi at low effort — freeform reasoning over SQL
// results, questions are usually shallow ("how much did I spend on X").
//
// The graph-walker runs Gemma with thinking OFF. In code-mode the work is
// "write one async program against typed tools, then summarize the result"
// — Kimi tended to over-fetch, re-resolve, and second-guess itself across
// retries. Gemma-no-think writes a tighter program, runs it once, and
// answers; the typed sandbox tools (outputSchema-backed) carry the
// structure Kimi was burning tokens to recover.
const ANALYST_MODEL_ID = '@cf/moonshotai/kimi-k2.6'
// Exported for the headless text-channel turn (ConciergeDO.answerText).
export const GRAPH_WALKER_MODEL_ID = '@cf/google/gemma-4-26b-a4b-it'

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
    // Reasoning OFF — Gemma's thinking trace is noise on traversal work, the
    // typed sandbox surface carries the structure. 10 steps so a multi-hop
    // walk (resolve → reverse-lookup → snapshot → …) plus recovery from a
    // bad slug or thrown sandbox exception all fit in one turn.
    model: { id: GRAPH_WALKER_MODEL_ID, reasoning: 'off', maxSteps: 10 },
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
