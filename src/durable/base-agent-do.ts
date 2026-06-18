import {
  Think,
  type ChatResponseResult,
  type StepConfig,
  type ThinkSubmissionInspection,
  type TurnConfig,
  type TurnContext,
} from '@cloudflare/think'
import { createWorkersAI } from 'workers-ai-provider'
import { wrapLanguageModel } from 'ai'
import type {
  LanguageModel,
  LanguageModelMiddleware,
  ModelMessage,
  ToolCallRepairFunction,
  ToolSet,
  UIMessage,
} from 'ai'
import {
  activeToolNames,
  allAgentNames,
  HANDOFF_TOOL_NAME,
  resolveActiveAgent,
  unionTools,
} from './agents/runtime'
import { makeHandoffTool, type HandoffResult } from './agents/tools/shared'
import type {
  AgentDef,
  AgentState,
  ModelConfig,
  Registry,
} from './agents/types'

type UIMessagePart = UIMessage['parts'][number]

// Gemma on Workers AI intermittently fails to emit a proper tool call: it either
// leaks the call into the TEXT/reasoning channel as raw chat-template tokens
// (`<|tool_call>call:name{…}<tool_call|>`), or dumps the would-be tool ARGUMENTS
// as a bare JSON object in content (`{"entries":{…}}`, finish=stop). Either way
// the SDK sees no structured tool call and the turn dies with nothing executed.
//
// Surgically un-garbling the bytes is whack-a-mole — every leak shape differs,
// and the worst (a structurally-fumbled args map) isn't recoverable at all. Gemma
// is STOCHASTIC, so instead we RE-ROLL: when a generation produced no tool call
// but its output is clearly a BOTCHED tool call, re-run it (up to MAX_REROLLS).
// A clean call almost always lands within a try or two.
//
// Editor-safe — a legitimate no-tool-call reply is PROSE (it has neither the leak
// sentinel nor a bare-JSON-object body), so it is never re-rolled. Applied via
// buildModel so it covers the editor AND ingest, streaming (prod) AND generate
// (bench).
const MAX_REROLLS = 2 // up to 3 total generations on a botched call
const TOOL_CALL_SENTINEL = /<\|?tool_call|tool_call\|>/

// Does a NO-tool-call output look like a botched tool call (vs. a legit prose
// reply)? Two signatures: the leak sentinel, or a body that is purely a JSON
// object (the would-be tool args dumped as text). Prose matches neither, so this
// keeps the re-roll from ever firing on a genuine chat/answer turn.
function looksLikeBotchedToolCall(text: string): boolean {
  if (TOOL_CALL_SENTINEL.test(text)) return true
  const t = text.trim()
  if (t.startsWith('{') && t.endsWith('}')) {
    try {
      const v: unknown = JSON.parse(t)
      return typeof v === 'object' && v !== null && !Array.isArray(v)
    } catch {
      /* not valid JSON — treat as prose */
    }
  }
  return false
}

const toolCallRerollMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  async wrapGenerate({ doGenerate }) {
    let res = await doGenerate()
    for (let reroll = 0; reroll < MAX_REROLLS; reroll++) {
      if (res.content.some((p) => p.type === 'tool-call')) break
      const text = res.content
        .map((p) => (p.type === 'text' || p.type === 'reasoning' ? p.text : ''))
        .join('\n')
      if (!looksLikeBotchedToolCall(text)) break // legit prose reply — keep it
      console.log('[tool-call-reroll] botched tool call, re-rolling', { attempt: reroll + 1 })
      res = await doGenerate()
    }
    return res
  },
  async wrapStream({ doStream }) {
    type StreamResult = Awaited<ReturnType<typeof doStream>>
    type Part = StreamResult['stream'] extends ReadableStream<infer T> ? T : never
    let result!: StreamResult
    let parts: Part[] = []
    // Buffer each attempt fully so we can see whether it produced a tool call
    // before deciding to re-roll; replay the chosen attempt as a fresh stream.
    for (let reroll = 0; ; reroll++) {
      result = await doStream()
      parts = []
      let hasToolCall = false
      let text = ''
      const reader = result.stream.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        parts.push(value)
        const t = (value as { type?: string }).type
        if (t === 'tool-call') hasToolCall = true
        else if (t === 'text-delta' || t === 'reasoning-delta')
          text += (value as { delta?: string }).delta ?? ''
      }
      if (hasToolCall || reroll >= MAX_REROLLS || !looksLikeBotchedToolCall(text)) break
      console.log('[tool-call-reroll] botched tool call (stream), re-rolling', {
        attempt: reroll + 1,
      })
    }
    return {
      ...result,
      stream: new ReadableStream<Part>({
        start(controller) {
          for (const p of parts) controller.enqueue(p)
          controller.close()
        },
      }),
    }
  },
}

// Framework-shaped DO that owns the Think runtime, the agent registry
// resolution, the handoff plumbing, and the off-websocket entry points
// (reset, dump, ask). Product DOs (ChatDO for the editor, ConciergeDO for
// the Q&A surface) extend this and supply:
//   - a `Registry` over their agent names
//   - an `AgentHost<Names>` for system prompt + tool set per agent
//   - optionally, a `beforeTurnFetch` to load per-turn context
//   - optionally, a `repairToolCall` hook
//   - optionally, an `onChatResponse` override
//
// The base assumes any concrete env exposes the Workers-AI binding `AI` and
// an optional `AI_GATEWAY_ID` for AI Gateway routing (both live on
// `Cloudflare.Env` in this project — see cloudflare-env.d.ts).
export abstract class BaseAgentDO<
  Env extends Cloudflare.Env,
  State,
> extends Think<Env, State> {
  // Subclass supplies its registry in its constructor (typically by calling
  // `makeXxxRegistry(this)` so the host can read live DO state in closures).
  protected abstract registry: Registry

  // Override to populate per-turn context before `beforeTurn` returns. Runs
  // once per turn and is awaited; cache results on the subclass instance.
  protected async beforeTurnFetch(): Promise<void> {
    /* no-op by default */
  }

  // Override to supply a domain-specific tool-call repair hook. Returns
  // `undefined` (no repair) by default.
  protected getRepairToolCall(): ToolCallRepairFunction<ToolSet> | undefined {
    return undefined
  }

  // ---- Active agent resolution ----

  protected activeAgent(): AgentDef {
    return resolveActiveAgent(this.registry, this.getConfig<AgentState>())
  }

  // The canonical model-invocation knobs for an agent's ModelConfig — the
  // SINGLE source the framework turn (activeAgentConfig, below) and any headless
  // run (e.g. the dedicated statement-ingest path, ChatDO.runDraftStatement)
  // both read. A headless path MUST build its streamText/generateText call from
  // this so it can't drift from the live turn on model build, output-token
  // budget, step budget, or tool-call repair — the exact drift that let the
  // hand-rolled ingest call diverge (32768 vs 16384 tokens, no repair hook).
  protected modelInvocation(model: ModelConfig): {
    model: LanguageModel
    maxOutputTokens?: number
    maxSteps?: number
    repairToolCall: ToolCallRepairFunction<ToolSet> | undefined
  } {
    return {
      model: this.buildModel(model),
      repairToolCall: this.getRepairToolCall(),
      ...(model.maxSteps !== undefined ? { maxSteps: model.maxSteps } : {}),
      ...(model.maxOutputTokens !== undefined ? { maxOutputTokens: model.maxOutputTokens } : {}),
    }
  }

  protected activeAgentConfig(): TurnConfig {
    const agent = this.activeAgent()
    const inv = this.modelInvocation(agent.model)
    return {
      system: agent.system(),
      model: inv.model,
      activeTools: activeToolNames(agent),
      repairToolCall: inv.repairToolCall,
      ...(inv.maxSteps !== undefined ? { maxSteps: inv.maxSteps } : {}),
      ...(inv.maxOutputTokens !== undefined ? { maxOutputTokens: inv.maxOutputTokens } : {}),
    }
  }

  // Build the Workers AI model for an agent's declared config. Reasoning 'off'
  // needs a chat-template flag, not reasoning_effort:null (a no-op — the model
  // keeps streaming a thinking trace). The flag NAME is model-specific:
  // kimi-k2.6 honors `thinking: false`, gemma-4 honors `enable_thinking: false`
  // — the two are not interchangeable. The provider only types
  // enable_thinking/clear_thinking, so cast. When AI_GATEWAY_ID is set, all
  // model calls route through the named AI Gateway for caching + logging.
  protected buildModel(cfg: ModelConfig): LanguageModel {
    const gatewayId = this.env.AI_GATEWAY_ID
    const workersai = createWorkersAI({
      binding: this.env.AI,
      ...(gatewayId ? { gateway: { id: gatewayId } } : {}),
    })
    // Gemma's thinking is a chat-template flag (enable_thinking), not
    // reasoning_effort — so map on/off to the flag in BOTH directions. (Every
    // current caller passes 'off'; only the statement-upload extraction opts
    // into reasoning, so only it gets gemma thinking.)
    const base =
      cfg.id.includes('gemma')
        ? workersai(cfg.id, {
            chat_template_kwargs: { enable_thinking: cfg.reasoning !== 'off' } as {
              enable_thinking?: boolean
            },
          })
        : cfg.reasoning === 'off'
          ? workersai(cfg.id, {
              chat_template_kwargs: { thinking: false } as { enable_thinking?: boolean },
            })
          : workersai(cfg.id, { reasoning_effort: cfg.reasoning })
    // Re-roll a botched tool call (gemma leaks/dumps it as text — see
    // toolCallRerollMiddleware). Generic: covers the editor AND ingest.
    return wrapLanguageModel({ model: base, middleware: toolCallRerollMiddleware })
  }

  // ---- Think per-turn config ----

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

  override async beforeTurn(ctx: TurnContext): Promise<TurnConfig> {
    await this.beforeTurnFetch()
    const cfg = this.activeAgentConfig()
    // Let a subclass rewrite the assembled model messages for this turn only
    // (e.g. expand an inline statement reference into its text) without touching
    // stored history.
    const messages = await this.transformTurnMessages(ctx.messages)
    return messages ? { ...cfg, messages } : cfg
  }

  // Override to rewrite the model messages for THIS turn (return undefined to
  // leave them unchanged). The result is sent to the model but not persisted.
  protected async transformTurnMessages(
    _messages: ModelMessage[],
  ): Promise<ModelMessage[] | undefined> {
    return undefined
  }

  override beforeStep(): StepConfig {
    // Re-resolve each step so a mid-turn handoff takes effect immediately.
    // Reuse whatever the subclass cached in beforeTurnFetch (no extra RPC).
    return this.activeAgentConfig() as StepConfig
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

  protected handoffContextBlock(): string {
    const ctx = this.getConfig<AgentState>()?.handoffContext
    return ctx ? `\n\n---\n\n# Context from the previous agent\n\n${ctx}` : ''
  }

  // ---- Off-websocket RPC ----

  // Reset conversational ownership back to the registry's entry agent. Called
  // when the user clears the conversation so the next surface upload starts
  // from the entry agent and produces a fresh, visible handoff (activeAgent
  // persists across a chat clear otherwise — clearing only wipes messages).
  async reset_active_agent(): Promise<{ ok: true }> {
    await this.__unsafe_ensureInitialized()
    this.configure<AgentState>({ activeAgent: this.registry.entry })
    return { ok: true }
  }

  // Debug-only: dump the full conversation history for inspection. Returns
  // raw UIMessage[] including tool-call parts with their input payloads.
  async dump_messages(): Promise<unknown[]> {
    await this.__unsafe_ensureInitialized()
    return this.getMessages()
  }

  // Run one user turn off-websocket and return the resulting assistant parts.
  // Used by non-streaming surfaces (Telegram webhook, server-to-server) — the
  // web path keeps streaming via the websocket. Rides on Think's programmatic
  // `saveMessages` entry point, which triggers the full model + tool loop and
  // resolves once the turn is `completed | skipped | aborted`. Surfaces that
  // depend on client tools (e.g. `draft_transaction` approval) shouldn't use
  // `ask()` — those agents will suspend mid-turn waiting for a client
  // resolution that this RPC can never deliver.
  async ask(parts: UIMessagePart[]): Promise<UIMessagePart[]> {
    await this.__unsafe_ensureInitialized()
    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      parts: parts as UIMessage['parts'],
    }
    const result = await this.saveMessages([userMsg])
    if (result.status !== 'completed') {
      return [
        {
          type: 'text',
          text: `[turn ${result.status}]`,
        } as UIMessagePart,
      ]
    }
    const all = await this.getMessages()
    const last = [...all].reverse().find((m) => m.role === 'assistant')
    return (last?.parts ?? []) as UIMessagePart[]
  }

  // ---- Observability ----

  onSubmissionStatus(s: ThinkSubmissionInspection): void {
    console.log(
      `[chat] submission ${s.submissionId} status=${s.status}` +
        (s.error ? ` error=${s.error}` : ''),
    )
  }

  // Default onChatResponse: just log the part/tool shape. Subclasses can
  // override (calling `super.onChatResponse(result)`) to add product-specific
  // history hygiene (e.g. redacting large tool outputs).
  async onChatResponse(result: ChatResponseResult): Promise<void> {
    const parts = Array.isArray(result.message.parts) ? result.message.parts : []
    const toolTypes = parts
      .map((p) => {
        if (typeof p !== 'object' || p === null || !('type' in p)) return ''
        const t = String((p as { type: unknown }).type)
        if (t.startsWith('tool-')) return t
        if (t === 'dynamic-tool') {
          const name = (p as { toolName?: unknown }).toolName
          return typeof name === 'string' ? `dynamic-tool:${name}` : 'dynamic-tool'
        }
        return ''
      })
      .filter((t) => t.length > 0)
    console.log(
      `[chat] onChatResponse role=${result.message.role} parts=${parts.length} tools=[${toolTypes.join(',')}]`,
    )
  }
}
