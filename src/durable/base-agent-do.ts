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

// Gemma on Workers AI intermittently fails to deliver a proper tool call. The
// DOMINANT mode (measured ~70% on a large draft): it returns a COMPLETE, VALID
// JSON object — the would-be tool args — in the `content` channel (finish=stop)
// instead of as a structured tool call. The bytes are fine; Workers AI's parser
// already did the gemma `<|"|>`→JSON conversion, it just routed the result to the
// wrong channel. The rarer mode: a structured tool call whose args JSON is broken
// (a stray gemma delimiter / fumbled key).
//
// So we CIRCUMVENT (not re-parse gemma's native format):
//   1. RECOVER — if a no-tool-call output's content is valid JSON matching an
//      available tool's input schema, re-channel it into that tool call. One pass,
//      deterministic. Kills the content-dump.
//   2. RE-ROLL — else, if the output still looks like a botched call (sentinel
//      leak or a JSON-object body we couldn't match), re-run it (gemma is
//      stochastic; a clean call usually lands in a try or two). Backstop for the
//      broken-args case.
//
// Editor-safe — a legitimate no-tool-call reply is PROSE (neither a schema-
// matching JSON object nor a sentinel), so it is never touched. Applied via
// buildModel so it covers the editor AND ingest, streaming (prod) AND generate.
const MAX_REROLLS = 2 // up to 3 total generations on a botched call
const TOOL_CALL_SENTINEL = /<\|?tool_call|tool_call\|>/

type FnTool = { type?: string; name?: string; inputSchema?: { required?: unknown } }

// If `text` is a bare JSON object that satisfies an available tool's REQUIRED
// keys, return that tool call (the content-dump, re-channeled). Generic — keyed
// off `params.tools`, nothing hardcoded. Null otherwise (prose, non-JSON, or no
// schema match — those fall through to the re-roll / are left as prose).
function recoverContentDump(
  text: string,
  tools: FnTool[] | undefined,
): { toolName: string; input: string } | null {
  const t = text.trim()
  if (!(t.startsWith('{') && t.endsWith('}'))) return null
  let obj: unknown
  try {
    obj = JSON.parse(t)
  } catch {
    return null
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null
  const keys = new Set(Object.keys(obj))
  for (const tool of tools ?? []) {
    if (tool?.type !== 'function' || !tool.name) continue
    const required = Array.isArray(tool.inputSchema?.required)
      ? (tool.inputSchema!.required as string[])
      : []
    if (required.length > 0 && required.every((k) => keys.has(k))) {
      return { toolName: tool.name, input: JSON.stringify(obj) }
    }
  }
  return null
}

// Does a NO-tool-call output look like a botched call worth re-rolling (vs. legit
// prose)? The leak sentinel, or a bare JSON-object body. Prose matches neither.
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
  async wrapGenerate({ doGenerate, params }) {
    const tools = (params as { tools?: FnTool[] }).tools
    let res = await doGenerate()
    for (let reroll = 0; reroll <= MAX_REROLLS; reroll++) {
      if (res.content.some((p) => p.type === 'tool-call')) break
      const text = res.content
        .map((p) => (p.type === 'text' || p.type === 'reasoning' ? p.text : ''))
        .join('\n')
      // 1. Recover a content-dumped tool call (valid JSON matching a tool schema).
      const rec = recoverContentDump(text, tools)
      if (rec) {
        console.log('[tool-call-recover] re-channeled content-dump → tool call', {
          tool: rec.toolName,
        })
        const nonText = res.content.filter((p) => p.type !== 'text' && p.type !== 'reasoning')
        return {
          ...res,
          content: [
            ...nonText,
            {
              type: 'tool-call',
              toolCallId: `recover_${crypto.randomUUID()}`,
              toolName: rec.toolName,
              input: rec.input,
            },
          ],
          finishReason: 'tool-calls',
        } as unknown as Awaited<ReturnType<typeof doGenerate>>
      }
      // 2. Else re-roll if it still looks botched; keep legit prose as-is.
      if (reroll >= MAX_REROLLS || !looksLikeBotchedToolCall(text)) break
      console.log('[tool-call-reroll] botched tool call, re-rolling', { attempt: reroll + 1 })
      res = await doGenerate()
    }
    return res
  },
  async wrapStream({ doStream, params }) {
    const tools = (params as { tools?: FnTool[] }).tools
    type StreamResult = Awaited<ReturnType<typeof doStream>>
    type Part = StreamResult['stream'] extends ReadableStream<infer T> ? T : never
    let result!: StreamResult
    let parts: Part[] = []
    let text = ''
    let hasToolCall = false
    // Buffer each attempt fully so we can inspect it before deciding what to do.
    for (let reroll = 0; ; reroll++) {
      result = await doStream()
      parts = []
      hasToolCall = false
      text = ''
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
      if (hasToolCall || reroll >= MAX_REROLLS) break
      // Recover a content-dump in place (no re-roll); else re-roll a botched call.
      if (recoverContentDump(text, tools) || !looksLikeBotchedToolCall(text)) break
      console.log('[tool-call-reroll] botched tool call (stream), re-rolling', {
        attempt: reroll + 1,
      })
    }
    // Re-channel a content-dump: drop the text/reasoning parts, inject the tool
    // call before finish, and force finishReason to tool-calls.
    const rec = !hasToolCall ? recoverContentDump(text, tools) : null
    let out = parts
    if (rec) {
      console.log('[tool-call-recover] re-channeled content-dump → tool call (stream)', {
        tool: rec.toolName,
      })
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
          out.push({
            type: 'tool-call',
            toolCallId: `recover_${crypto.randomUUID()}`,
            toolName: rec.toolName,
            input: rec.input,
          } as unknown as Part)
          out.push({ ...(p as object), finishReason: 'tool-calls' } as unknown as Part)
          continue
        }
        out.push(p)
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
