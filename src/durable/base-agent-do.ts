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
import type { UsageDO } from './usage-do'
import type {
  AgentDef,
  AgentState,
  ModelConfig,
  Registry,
} from './agents/types'

type UIMessagePart = UIMessage['parts'][number]

// Gemma on Workers AI intermittently leaks a tool call into the TEXT (or
// reasoning) channel as its raw chat-template tokens
// (`<|tool_call>:name{json-args}<tool_call|>`) instead of a structured tool
// call — the SDK then sees plain text and the turn dies with no tool executed.
// RECOVER it: parse the tool name + (JSON) args out of the sentinel and re-inject
// a structured tool call, dropping the leaked text. If the args aren't
// JSON-parseable (e.g. gemma's `<|"|>` value encoding), leave the response
// untouched — no worse than no middleware. Applied via buildModel so it covers
// both the streaming (prod) and generate (bench) paths.
const TOOL_CALL_LEAK = /<\|tool_call>\s*:?\s*([A-Za-z0-9_]+)\s*(\{[\s\S]*?\})\s*<tool_call\|>/g
const TOOL_CALL_SENTINEL = /<\|?tool_call|tool_call\|>/

type RecoveredCall = { type: 'tool-call'; toolCallId: string; toolName: string; input: string }

function recoverLeakedToolCalls(text: string): RecoveredCall[] {
  const calls: RecoveredCall[] = []
  TOOL_CALL_LEAK.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOOL_CALL_LEAK.exec(text)) !== null) {
    let parsed: unknown
    try {
      parsed = JSON.parse(m[2]!)
    } catch {
      continue // non-JSON args — can't recover safely, leave it
    }
    calls.push({
      type: 'tool-call',
      toolCallId: `rescue_${crypto.randomUUID()}`,
      toolName: m[1]!,
      input: JSON.stringify(parsed),
    })
  }
  return calls
}

const isTextish = (t: string | undefined) => t === 'text' || t === 'reasoning'

const toolCallRescueMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  async wrapGenerate({ doGenerate }) {
    const res = await doGenerate()
    if (res.content.some((p) => p.type === 'tool-call')) return res
    const text = res.content
      .map((p) => (p.type === 'text' || p.type === 'reasoning' ? p.text : ''))
      .join('\n')
    if (!TOOL_CALL_SENTINEL.test(text)) return res
    const calls = recoverLeakedToolCalls(text)
    if (calls.length === 0) return res
    const cleaned = res.content.filter(
      (p) => !(isTextish(p.type) && TOOL_CALL_SENTINEL.test((p as { text: string }).text)),
    )
    return { ...res, content: [...cleaned, ...calls], finishReason: 'tool-calls' } as unknown as Awaited<
      ReturnType<typeof doGenerate>
    >
  },
  async wrapStream({ doStream }) {
    const result = await doStream()
    const { stream } = result
    type Part = typeof stream extends ReadableStream<infer T> ? T : never
    const parts: Part[] = []
    let hasToolCall = false
    let text = ''
    const reader = stream.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(value)
      const t = (value as { type?: string }).type
      if (t === 'tool-call') hasToolCall = true
      else if (t === 'text-delta' || t === 'reasoning-delta')
        text += (value as { delta?: string }).delta ?? ''
    }
    let out = parts
    if (!hasToolCall && TOOL_CALL_SENTINEL.test(text)) {
      const calls = recoverLeakedToolCalls(text)
      if (calls.length > 0) {
        // Drop the leaked text/reasoning stream and inject the recovered tool
        // calls just before finish, forcing the finish reason to tool-calls.
        const textParts = new Set([
          'text-start',
          'text-delta',
          'text-end',
          'reasoning-start',
          'reasoning-delta',
          'reasoning-end',
        ])
        out = []
        for (const p of parts) {
          const t = (p as { type?: string }).type
          if (t && textParts.has(t)) continue
          if (t === 'finish') {
            for (const c of calls) out.push(c as unknown as Part)
            out.push({ ...(p as object), finishReason: 'tool-calls' } as unknown as Part)
            continue
          }
          out.push(p)
        }
      }
    }
    return {
      ...result,
      stream: new ReadableStream<Part>({
        start(controller) {
          for (const p of out) controller.enqueue(p)
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
  constructor(state: DurableObjectState, env: Env) {
    super(state, env)
    // Loosen Think's chat-recovery bounds for long agentic turns. Think 0.11
    // made `maxRecoveryWork` a FINITE default (1000; it was Infinity pre-#1825),
    // and added a 300s no-progress window + 10-attempt cap. A long turn — chiefly
    // our `codemode` turns — that gets interrupted (a dropped WS) and re-run can
    // exhaust those bounds and be SEALED instead of recovered, so the client is
    // left showing the in-flight tool as "Interrupted" even though the server
    // finished. These generous limits restore ~0.7 recovery for codemode-heavy
    // turns while still capping a true runaway. `maxOomRetries` keeps its default
    // — an OOM is a real signal we don't want to retry indefinitely.
    // (Overrides Think's `this.chatRecovery = true` default.)
    this.chatRecovery = {
      maxRecoveryWork: 100_000,
      maxAttempts: 50,
      noProgressTimeoutMs: 600_000,
    }
  }

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
    // Recover gemma's tool-call-into-text leak (toolCallRescueMiddleware), and
    // meter token usage for every gateway call (usageMiddleware) — the single
    // chokepoint, so concierge/editor/messengers are all captured uniformly.
    return wrapLanguageModel({
      model: base,
      middleware: [toolCallRescueMiddleware, this.usageMiddleware(cfg.id)],
    })
  }

  // Which product surface this DO is — tags usage rows. Subclasses override.
  protected surface(): string {
    return 'unknown'
  }

  // MONITORING-ONLY usage capture, wrapped around every model call. Reads each
  // generation's token usage and forwards it to the per-user UsageDO; cost is
  // computed there. Fire-and-forget: an outstanding cross-DO RPC keeps this DO
  // alive until it settles, so no waitUntil is needed, and a dropped record must
  // never affect the turn (this is metering, not billing or enforcement).
  private recordUsageBestEffort(
    model: string,
    usage: { inputTokens?: number; outputTokens?: number } | undefined,
  ): void {
    // Coerce with isFinite, not `?? 0`: providers sometimes report a NaN count,
    // and `??` only catches null/undefined — a NaN would slip through, survive
    // the structured-clone DO RPC, and bind as NULL (cost_micros NOT NULL trips).
    const inTok = Number.isFinite(usage?.inputTokens) ? (usage!.inputTokens as number) : 0
    const outTok = Number.isFinite(usage?.outputTokens) ? (usage!.outputTokens as number) : 0
    if (!inTok && !outTok) return
    const env = this.env as unknown as { USAGE_DO?: DurableObjectNamespace<UsageDO> }
    const ns = env.USAGE_DO
    if (!ns || !this.name) return
    ns.get(ns.idFromName(this.name))
      .recordUsage({ surface: this.surface(), model, inTok, outTok })
      .catch((e: unknown) => console.warn(`[usage] record failed: ${e}`))
  }

  private usageMiddleware(model: string): LanguageModelMiddleware {
    return {
      specificationVersion: 'v3',
      wrapGenerate: async ({ doGenerate }) => {
        const res = await doGenerate()
        this.recordUsageBestEffort(
          model,
          res.usage as unknown as { inputTokens?: number; outputTokens?: number },
        )
        return res
      },
      wrapStream: async ({ doStream }) => {
        const { stream, ...rest } = await doStream()
        const record = (u: { inputTokens?: number; outputTokens?: number } | undefined) =>
          this.recordUsageBestEffort(model, u)
        const tap = new TransformStream({
          transform(chunk, controller) {
            if ((chunk as { type?: string }).type === 'finish') {
              record((chunk as { usage?: { inputTokens?: number; outputTokens?: number } }).usage)
            }
            controller.enqueue(chunk)
          },
        })
        return { stream: stream.pipeThrough(tap), ...rest }
      },
    }
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
