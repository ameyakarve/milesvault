import type { LanguageModel, ToolSet } from 'ai'
import type { AgentDef, Registry } from '../types'

// The host (LedgerDO) supplies the concrete builders, closing over the live
// DO instance. The registry just names agents and wires the handoff graph,
// so it stays free of any DO-specific imports (no circular dependency). The
// agents' `tools()` exclude the handoff tool — that one is registered globally
// by the host and gated per-agent via activeTools (see runtime).
export interface EditorHost {
  ledgerSystem(): string
  ledgerTools(): ToolSet
  ledgerModel(): LanguageModel
  statementSystem(): string
  statementTools(): ToolSet
  statementModel(): LanguageModel
}

// The `/editor` surface. `ledger` (entry) handles freeform edits and hands
// statement uploads to `statement`, which owns the extract → clarify → draft
// conversation and hands back when done. Graph: ledger ↔ statement.
export function makeEditorRegistry(host: EditorHost): Registry {
  const ledger: AgentDef = {
    name: 'ledger',
    canHandoffTo: ['statement'],
    system: () => host.ledgerSystem(),
    tools: () => host.ledgerTools(),
    model: () => host.ledgerModel(),
  }
  const statement: AgentDef = {
    name: 'statement',
    canHandoffTo: ['ledger'],
    system: () => host.statementSystem(),
    tools: () => host.statementTools(),
    model: () => host.statementModel(),
  }
  return { name: 'editor', entry: 'ledger', agents: { ledger, statement } }
}
