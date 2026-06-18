import type { AgentDef, AgentHost, Registry } from '../types'

// Workers AI model ids. Everything runs Gemma with thinking OFF (owner call,
// 2026-06-10: one model across all AI workflows). Previously the ledger agent
// ran Kimi (freeform reasoning over
// edits); the statement specialist runs Gemma (cheap, fast, reasoning-off
// extraction — the shape the extractor evals were tuned on).
export const LEDGER_MODEL_ID = '@cf/google/gemma-4-26b-a4b-it'
// Exported for the headless rules-playground preview (ChatDO.previewDrafts).
export const STATEMENT_MODEL_ID = '@cf/google/gemma-4-26b-a4b-it'

// Editor tool-loop step budget. Multi-step turns (find rows → read them → look
// up a card's pool → draft) need more than Think's default 10; 14 gives headroom
// without letting a flailing turn run forever. (Bumping to 18 did NOT help the
// magnus attribution case — gemma just fills the bigger budget with more
// redundant queries, never converging to a draft; the cap isn't the bottleneck.)
// The headless bench uses the SAME value so it measures what production does.
export const EDITOR_MAX_STEPS = 14

export type EditorAgentName = 'ledger'

// The `/editor` surface. ONE agent (`ledger`): it handles freeform edits AND
// statement uploads itself (read_statement → extract → draft) — no handoff, no
// separate statement specialist (owner call: the ledger↔statement split added a
// dead-end the headless ingest had no tool for, and bought nothing). Headless
// statement ingest runs this same brain via ChatDO.runDraftStatement.
//
// The host (a `BaseAgentDO`) supplies system prompt + tools, closing over the
// live DO instance.
export function makeEditorRegistry(host: AgentHost<EditorAgentName>): Registry {
  const ledger: AgentDef = {
    name: 'ledger',
    canHandoffTo: [],
    model: { id: LEDGER_MODEL_ID, reasoning: 'low', maxOutputTokens: 16384, maxSteps: EDITOR_MAX_STEPS },
    system: () => host.system('ledger'),
    tools: () => host.tools('ledger'),
  }
  return { name: 'editor', entry: 'ledger', agents: { ledger } }
}
