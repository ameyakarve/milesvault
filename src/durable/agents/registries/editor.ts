import type { ToolSet } from 'ai'
import type { AgentDef, Registry } from '../types'

// Shared by both editor agents — one Workers AI model id. Reasoning level is
// per-agent (see each AgentDef.model below), not part of the id.
const MODEL_ID = '@cf/moonshotai/kimi-k2.6'

// The host (ChatDO) supplies the concrete builders, closing over the live
// DO instance. The registry just names agents and wires the handoff graph,
// so it stays free of any DO-specific imports (no circular dependency). The
// agents' `tools()` exclude the handoff tool — that one is registered globally
// by the host and gated per-agent via activeTools (see runtime). Model choice
// is declared as data on each AgentDef, not supplied by the host.
export interface EditorHost {
  ledgerSystem(): string
  ledgerTools(): ToolSet
  statementSystem(): string
  statementTools(): ToolSet
}

// The `/editor` surface. `ledger` (entry) handles freeform edits and hands
// statement uploads to `statement`, which owns the extract → clarify → draft
// conversation and hands back when done. Graph: ledger ↔ statement.
export function makeEditorRegistry(host: EditorHost): Registry {
  const ledger: AgentDef = {
    name: 'ledger',
    canHandoffTo: ['statement'],
    model: { id: MODEL_ID, reasoning: 'low' },
    system: () => host.ledgerSystem(),
    tools: () => host.ledgerTools(),
  }
  const statement: AgentDef = {
    name: 'statement',
    canHandoffTo: ['ledger'],
    // Extraction ran with reasoning OFF historically (the old extractor used
    // enable_thinking=false); the trace mostly added latency, not accuracy.
    model: { id: MODEL_ID, reasoning: 'off' },
    system: () => host.statementSystem(),
    tools: () => host.statementTools(),
  }
  return { name: 'editor', entry: 'ledger', agents: { ledger, statement } }
}
