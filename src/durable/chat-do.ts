import {
  Think,
  type ChatResponseResult,
  type ThinkSubmissionInspection,
  type TurnConfig,
  type StepConfig,
} from '@cloudflare/think'
import { createWorkersAI } from 'workers-ai-provider'
import { type LanguageModel, type ToolSet } from 'ai'
import { buildLedgerSystem, buildStatementAgentSystem } from './agent-prompt'
import type { LedgerDO } from './ledger-do'
import { makeEditorRegistry, type EditorHost } from './agents/registries/editor'
import {
  activeToolNames,
  allAgentNames,
  HANDOFF_TOOL_NAME,
  resolveActiveAgent,
  unionTools,
} from './agents/runtime'
import { makeHandoffTool, type HandoffResult } from './agents/handoff'
import { draftTransactionTool, clarifyTool, readStatementTool } from './agents/tools'
import type { AgentDef, AgentState, ModelConfig, Registry } from './agents/types'

// The chat/agent runtime. Holds conversation history + the agent registry and
// drives the editor agents (ledger ↔ statement). It is pure compute: all
// ledger reads (snapshot, statement blobs) go to the LedgerDO storage object
// over RPC, keyed by the same per-user name; writes (approved drafts) flow back
// through the browser REST path, never directly from here.
type Snapshot = Awaited<ReturnType<LedgerDO['ledger_snapshot']>>

// No broadcast state: the file chip is driven entirely by local upload state in
// the client now that extraction is inline (no async worker phase to mirror).
export type ChatDOState = Record<string, never>

function todayInt(): number {
  const now = new Date()
  const yyyy = now.getUTCFullYear().toString().padStart(4, '0')
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0')
  const dd = now.getUTCDate().toString().padStart(2, '0')
  return Number(`${yyyy}${mm}${dd}`)
}

export class ChatDO extends Think<Cloudflare.Env, ChatDOState> implements EditorHost {
  private registry: Registry
  initialState: ChatDOState = {}

  // The ledger snapshot for the current turn, fetched once in beforeTurn (async
  // RPC) and reused by the sync system-prompt builders + every beforeStep.
  private turnSnapshot: Snapshot | null = null

  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env)
    this.registry = makeEditorRegistry(this)
  }

  private ledgerStub(): DurableObjectStub<LedgerDO> {
    const ns = this.env.LEDGER_DO as unknown as DurableObjectNamespace<LedgerDO>
    return ns.get(ns.idFromName(this.name))
  }

  private snapshot(): Snapshot {
    return (
      this.turnSnapshot ?? {
        today: todayInt(),
        accounts: [],
        row_counts: {},
        sample_txns: '',
        schema_ddl: '',
      }
    )
  }

  // ---- Active agent resolution ----

  private activeAgent(): AgentDef {
    return resolveActiveAgent(this.registry, this.getConfig<AgentState>())
  }

  private activeAgentConfig(): {
    system: string
    model: LanguageModel
    activeTools: string[]
  } {
    const agent = this.activeAgent()
    return {
      system: agent.system(),
      model: this.buildModel(agent.model),
      activeTools: activeToolNames(agent),
    }
  }

  // Build the Workers AI model for an agent's declared config. Reasoning 'off'
  // must use the chat-template flag — reasoning_effort:null is a no-op on Kimi
  // (it still streams a thinking trace); enable_thinking=false is what the model
  // actually honors. The other levels map straight to reasoning_effort.
  private buildModel(cfg: ModelConfig): LanguageModel {
    const workersai = createWorkersAI({ binding: this.env.AI })
    if (cfg.reasoning === 'off') {
      return workersai(cfg.id, { chat_template_kwargs: { enable_thinking: false } })
    }
    return workersai(cfg.id, { reasoning_effort: cfg.reasoning })
  }

  // ---- Think per-turn config (delegates to the active agent) ----

  getModel(): LanguageModel {
    return this.buildModel(this.activeAgent().model)
  }

  getSystemPrompt(): string {
    return this.activeAgent().system()
  }

  getTools(): ToolSet {
    return {
      ...unionTools(this.registry),
      [HANDOFF_TOOL_NAME]: this.handoffTool(),
    }
  }

  // beforeTurn is awaited by the framework, so we fetch the live ledger
  // snapshot over RPC here (getSystemPrompt is sync and can't) and pin the
  // active agent's config for the turn.
  override async beforeTurn(): Promise<TurnConfig> {
    this.turnSnapshot = await this.ledgerStub().ledger_snapshot()
    return this.activeAgentConfig()
  }

  override beforeStep(): StepConfig {
    // Re-resolve each step so a mid-turn handoff takes effect immediately. Reuse
    // the snapshot fetched in beforeTurn — it doesn't change within a turn.
    return this.activeAgentConfig()
  }

  // ---- Handoff ----

  private handoffTool() {
    return makeHandoffTool(allAgentNames(this.registry), (to, context) =>
      this.doHandoff(to, context),
    )
  }

  private doHandoff(to: string, context: string): HandoffResult {
    const current = this.activeAgent()
    if (!current.canHandoffTo.includes(to) || !this.registry.agents[to]) {
      return {
        ok: false,
        error: 'invalid_target',
        allowed: [...current.canHandoffTo],
      }
    }
    this.configure<AgentState>({ activeAgent: to, handoffContext: context })
    return { ok: true, handed_off_to: to }
  }

  // Reset conversational ownership back to the registry's entry agent. Called
  // when the user clears the conversation so the next statement upload starts
  // from `ledger` and produces a fresh, visible handoff (activeAgent persists
  // across a chat clear otherwise — clearing only wipes messages).
  async reset_active_agent(): Promise<{ ok: true }> {
    await this.__unsafe_ensureInitialized()
    this.configure<AgentState>({ activeAgent: this.registry.entry })
    return { ok: true }
  }

  private handoffContextBlock(): string {
    const ctx = this.getConfig<AgentState>()?.handoffContext
    return ctx ? `\n\n---\n\n# Context from the previous agent\n\n${ctx}` : ''
  }

  // ---- EditorHost: the `ledger` agent (freeform editor) ----

  ledgerSystem(): string {
    return buildLedgerSystem(this.snapshot()) + this.handoffContextBlock()
  }

  ledgerTools(): ToolSet {
    return {
      draft_transaction: draftTransactionTool(),
      clarify: clarifyTool(),
    }
  }

  // ---- EditorHost: the `statement` specialist agent ----

  statementSystem(): string {
    return buildStatementAgentSystem(this.snapshot()) + this.handoffContextBlock()
  }

  statementTools(): ToolSet {
    return {
      draft_transaction: draftTransactionTool(),
      clarify: clarifyTool(),
      read_statement: readStatementTool((id) => this.ledgerStub().get_statement(id)),
    }
  }

  // ---- Observability + history hygiene ----

  onSubmissionStatus(s: ThinkSubmissionInspection): void {
    console.log(
      `[chat] submission ${s.submissionId} status=${s.status}` +
        (s.error ? ` error=${s.error}` : ''),
    )
  }

  async onChatResponse(result: ChatResponseResult): Promise<void> {
    const parts = Array.isArray(result.message.parts) ? result.message.parts : []
    const toolTypes = parts
      .map((p) => (typeof p === 'object' && p && 'type' in p ? String((p as { type: unknown }).type) : ''))
      .filter((t) => t.startsWith('tool-'))
    console.log(
      `[chat] onChatResponse role=${result.message.role} parts=${parts.length} tools=[${toolTypes.join(',')}]`,
    )

    // Redact the raw statement text that read_statement injected into history.
    // The model has used it this turn; leaving the full blob (often tens of KB)
    // re-pays its token cost on every subsequent turn (Kimi's reasoning trace
    // amplifies that). The blob still lives in LedgerDO storage, so the model
    // can simply call read_statement again if it genuinely needs it.
    const messages = await this.syncMessagesFromStorage()
    for (const msg of messages) {
      const msgParts = Array.isArray(msg.parts) ? msg.parts : []
      let mutated = false
      const nextParts = msgParts.map((p) => {
        if (
          typeof p !== 'object' ||
          p === null ||
          (p as { type?: unknown }).type !== 'tool-read_statement'
        ) {
          return p
        }
        const part = p as { output?: { ok?: boolean; text?: unknown } }
        const out = part.output
        if (!out || typeof out.text !== 'string' || out.text.startsWith('[statement text')) {
          return p
        }
        mutated = true
        return {
          ...p,
          output: { ...out, text: '[statement text omitted from history — call read_statement again if you need it]' },
        }
      })
      if (mutated) {
        await this.updateMessageInHistory({ ...msg, parts: nextParts as typeof msg.parts })
      }
    }
  }
}
