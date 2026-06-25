import type { AgentDef, AgentHost, Registry } from '../types'

// Workers AI model id. One model across all AI workflows (owner call,
// 2026-06-10): Gemma with thinking OFF. maxSteps 10 so a multi-hop walk
// (resolve → reverse-lookup → snapshot/query → …) plus recovery from a bad
// slug fits in one turn.
// Exported for the headless text-channel turn (ConciergeDO.answerText).
export const CONCIERGE_MODEL_ID = '@cf/google/gemma-4-26b-a4b-it'

export type ConciergeAgentName = 'concierge'

// The `/concierge` surface — a SINGLE read-only "ask anything" agent over both
// the user's ledger AND the points/miles knowledge graph. No analyst/graph-walker
// split, no handoff: it holds every read tool (kb_*, ledger_snapshot, query_sql,
// show_award_options, ask_user) at once and reasons across them in one turn.
export function makeConciergeRegistry(host: AgentHost<ConciergeAgentName>): Registry {
  const concierge: AgentDef = {
    name: 'concierge',
    canHandoffTo: [], // single agent — the handoff tool is never offered
    model: { id: CONCIERGE_MODEL_ID, reasoning: 'off', maxSteps: 10 },
    system: () => host.system('concierge'),
    tools: () => host.tools('concierge'),
  }
  return {
    name: 'concierge',
    entry: 'concierge',
    agents: { concierge },
  }
}
