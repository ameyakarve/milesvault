import type { AgentDef, AgentHost, Registry } from '../types'

// Workers AI model ids. Everything runs Gemma with thinking OFF (owner call,
// 2026-06-10: one model across all AI workflows). Previously the ledger agent
// ran Kimi (freeform reasoning over
// edits); the statement specialist runs Gemma (cheap, fast, reasoning-off
// extraction — the shape the extractor evals were tuned on).
const LEDGER_MODEL_ID = '@cf/moonshotai/kimi-k2.6'
// Exported for the headless rules-playground preview (ChatDO.previewDrafts).
export const STATEMENT_MODEL_ID = '@cf/google/gemma-4-26b-a4b-it'

// Editor tool-loop step budget. Multi-step turns (find rows → read them → look
// up a card's pool → draft) need more than Think's default 10; 14 gives headroom
// without letting a flailing turn run forever. The headless bench uses the SAME
// value so it measures what production does.
export const EDITOR_MAX_STEPS = 14

export type EditorAgentName = 'ledger' | 'statement'

// The `/editor` surface. `ledger` (entry) handles freeform edits and hands
// statement uploads to `statement`, which owns the extract → clarify → draft
// conversation and hands back when done. Graph: ledger ↔ statement.
//
// The host (a `BaseAgentDO`) supplies system prompt + tools per agent name,
// closing over the live DO instance. The registry just names agents and
// wires the handoff graph, so it stays free of any DO-specific imports.
// The agents' `tools()` exclude the handoff tool — that one is registered
// globally by the base DO and gated per-agent via activeTools (see runtime).
export function makeEditorRegistry(host: AgentHost<EditorAgentName>): Registry {
  const ledger: AgentDef = {
    name: 'ledger',
    canHandoffTo: ['statement'],
    model: { id: LEDGER_MODEL_ID, reasoning: 'off', maxOutputTokens: 16384, maxSteps: EDITOR_MAX_STEPS },
    system: () => host.system('ledger'),
    tools: () => host.tools('ledger'),
  }
  const statement: AgentDef = {
    name: 'statement',
    canHandoffTo: ['ledger'],
    // Gemma with reasoning OFF — the extractor evals were tuned on this; the
    // thinking trace mostly added latency, not accuracy.
    model: { id: STATEMENT_MODEL_ID, reasoning: 'off', maxOutputTokens: 16384 },
    system: () => host.system('statement'),
    tools: () => host.tools('statement'),
  }
  return { name: 'editor', entry: 'ledger', agents: { ledger, statement } }
}
