import { Think } from '@cloudflare/think'
import type {
  ToolCallResultContext,
  TurnConfig,
  TurnContext,
} from '@cloudflare/think'
import { createWorkspaceTools } from '@cloudflare/think/tools/workspace'
import { createToolsFromClientSchemas } from 'agents/chat'
import type { ChatProtocolEvent } from 'agents/chat'
import type { Session } from 'agents/experimental/memory/session'
import {
  createCompactFunction,
  truncateOlderMessages,
} from 'agents/experimental/memory/utils'
import {
  convertToModelMessages,
  generateText,
  hasToolCall,
  pruneMessages,
  stepCountIs,
  streamText,
  wrapLanguageModel,
  type LanguageModel,
  type ToolSet,
} from 'ai'
import { kimiRescueMiddleware } from '@/lib/chat/kimi-rescue-middleware'
import { toolDisciplineMiddleware } from '@/lib/chat/tool-discipline-middleware'
import { createNimChatModel } from '@/lib/chat/nim-provider'
import { createLedgerClient, LedgerBindingError } from '@/lib/ledger-api'
import { buildAccountsBlock, buildSystemPrompt } from './think-agent-prompt'
import { buildGenerateEntryTool } from './writer-agent'

const DEFAULT_WRITER_MAX_ATTEMPTS = 3

// @ts-expect-error intentional override of Think's `private _runInferenceLoop`
// (see the override below for why / what upstream fix replaces this).
export class ThinkAgent extends Think<Cloudflare.Env> {
  maxSteps = 10

  private cachedMainModel?: LanguageModel
  private cachedWriterModel?: LanguageModel
  private accountsForTurn: readonly string[] = []

  getModel(): LanguageModel {
    if (!this.cachedMainModel) {
      this.cachedMainModel = wrapLanguageModel({
        model: createNimChatModel(this.env, this.env.CHAT_MODEL, 'cf-ai-gateway-nim'),
        // Order: outermost first. `toolDiscipline` must see post-rescue
        // tool_calls so it correctly skips retry when `kimiRescue` already
        // recovered a call from leaked envelope tokens.
        middleware: [
          toolDisciplineMiddleware({
            replyToolName: 'reply',
            nudge:
              'Your previous reply was free-form text with no tool call. ALL user-facing text must go through the `reply` tool. Retry now: call `reply` with a `message` argument for what you meant to say; if you were staging a transaction, also call the appropriate propose_* tool in the same step.',
            logPrefix: 'think-tool-discipline',
          }),
          kimiRescueMiddleware,
        ],
      })
    }
    return this.cachedMainModel
  }

  private getWriterModel(): LanguageModel {
    if (!this.cachedWriterModel) {
      const modelName = this.env.WRITER_MODEL ?? this.env.CHAT_MODEL
      this.cachedWriterModel = createNimChatModel(this.env, modelName, 'cf-ai-gateway-writer')
    }
    return this.cachedWriterModel
  }

  getSystemPrompt(): string {
    return buildSystemPrompt()
  }

  getTools(): ToolSet {
    const email = this.name
    if (!email || !email.includes('@')) return {}
    return {
      generate_entry: buildGenerateEntryTool({
        model: this.getWriterModel(),
        maxAttempts: readWriterMaxAttempts(this.env),
        getAccounts: () => this.accountsForTurn,
      }),
    }
  }

  async configureSession(session: Session): Promise<Session> {
    const summarizerModel = this.getModel()
    return session
      .withCachedPrompt()
      .onCompaction(
        createCompactFunction({
          summarize: async (prompt) => {
            const { text } = await generateText({
              model: summarizerModel,
              prompt,
            })
            return text
          },
        }),
      )
      .compactAfter(60_000)
  }

  async beforeTurn(ctx: TurnContext): Promise<TurnConfig | void> {
    const email = this.name
    if (!email || !email.includes('@')) return
    let userAccounts: string[] = []
    try {
      const client = createLedgerClient(this.env, email)
      userAccounts = await client.v2_listAccounts()
    } catch (e) {
      if (!(e instanceof LedgerBindingError)) {
        console.warn('[think] listAccounts failed', String(e))
      }
    }
    this.accountsForTurn = userAccounts
    if (userAccounts.length === 0) {
      console.warn(`[think] beforeTurn: accounts=0 for ${email}`)
    } else {
      console.log(`[think] beforeTurn: accounts=${userAccounts.length}`)
    }
    return { system: `${ctx.system}\n\n${buildAccountsBlock(userAccounts)}` }
  }

  afterToolCall(ctx: ToolCallResultContext): void {
    const outcome = ctx.success ? 'ok' : 'err'
    console.log(`[think] tool=${ctx.toolName} ${outcome} in ${ctx.durationMs}ms`)
  }

  override onChatError(error: unknown): unknown {
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    console.error('[think] onChatError', msg)
    return error
  }

  // ---------------------------------------------------------------------------
  // UPSTREAM PATCH: inject `stopWhen: hasToolCall('reply')` into the agentic loop
  // ---------------------------------------------------------------------------
  //
  // WHAT THIS IS
  // ------------
  // A full reimplementation of `Think._runInferenceLoop` that is byte-for-byte
  // identical to the upstream version (@cloudflare/think@0.3.0) except for
  // one line: the `stopWhen` option passed to `streamText` is broadened from
  //
  //     stopWhen: stepCountIs(finalMaxSteps)
  //
  // to
  //
  //     stopWhen: [stepCountIs(finalMaxSteps), hasToolCall('reply')]
  //
  // which ends the turn as soon as the model calls `reply`. That tool is our
  // one and only user-facing reply channel, so its invocation is by definition
  // terminal — there is nothing left to do in the same turn once it has fired.
  //
  // WHY WE HAVE TO DO IT HERE
  // -------------------------
  // `Think._runInferenceLoop` hardcodes `stopWhen` and does not pipe through
  // `TurnConfig.stopWhen` (or anything equivalent). Without this override we
  // have no way to terminate the loop on a semantic signal; we can only wait
  // for `stepCountIs(maxSteps)` or for the model to voluntarily emit text
  // with no tool calls. Kimi K2 does neither reliably: after a successful
  // `propose` + `reply`, it frequently re-calls `generate_entry` + `propose`
  // + `reply` a second time ("let me double-check my work"), burning ~3 extra
  // model round-trips before finally giving up. Server-side dedup on `propose`
  // and the UI busy-latch mask the symptoms but don't stop the model from
  // looping.
  //
  // UPSTREAM FIX WE'RE WAITING ON
  // -----------------------------
  // File @cloudflare/think issue/PR: expose `stopWhen` (or a
  // `stopConditions: StopCondition[]`) on `TurnConfig`, merge it into the
  // array passed to `streamText`. Roughly:
  //
  //     stopWhen: [
  //       stepCountIs(finalMaxSteps),
  //       ...(config.stopConditions ?? []),
  //     ],
  //
  // Once that ships, delete this override and set `stopConditions:
  // [hasToolCall('reply')]` in `beforeTurn`'s returned `TurnConfig`.
  //
  // MAINTENANCE RISK
  // ----------------
  // This method is a copy of a `private` framework method; upstream changes
  // to `_runInferenceLoop` (new hooks, reshuffled tool merge order, new
  // streamText args) will silently diverge until we notice. Re-check against
  // `node_modules/@cloudflare/think/dist/think.js` on every version bump.
  // The referenced Think version is tracked in package.json.
  //
  // Any rewrite of this method MUST preserve:
  //   - tool merge order: workspace, base, extension, context, mcp, client, caller
  //   - system prompt: session.freezeSystemPrompt() falls back to getSystemPrompt()
  //   - message pruning via `pruneMessages({toolCalls: 'before-last-2-messages'})`
  //   - both `beforeTurn` + `_pipelineExtensionBeforeTurn` running in sequence
  //   - `_wrapToolsWithDecision(...)` wrapping — gates approvals, extension hooks
  //   - all extension pipeline callbacks (chunk, stepFinish, toolCallFinish)
  //   - afterToolCall receiving `{...toolCall, stepNumber, messages, durationMs}`
  //     plus success/output OR error
  //   - final `_transformInferenceResult(result)` passthrough
  //
  // TypeScript note: `_runInferenceLoop`, `_wrapToolsWithDecision`, and the
  // `_pipelineExtension*` methods are declared `private` in think.d.ts. The
  // runtime has no real privacy, so we access them via `(this as any)` and
  // the override via `@ts-expect-error`. When upstream relaxes the modifier
  // or adds the hook, the `any` casts go away.
  //
  override async _runInferenceLoop(input: {
    signal?: AbortSignal
    callerTools?: ToolSet
    clientTools?: unknown[]
    continuation: boolean
    body?: unknown
  }): Promise<unknown> {
    const self = this as any

    if (self.waitForMcpConnections) {
      const timeout =
        typeof self.waitForMcpConnections === 'object'
          ? self.waitForMcpConnections.timeout
          : 10_000
      await self.mcp.waitForConnections({ timeout })
    }

    const workspaceTools = createWorkspaceTools(self.workspace)
    const baseTools = this.getTools()
    const extensionTools = self.extensionManager?.getTools() ?? {}
    const contextTools = await self.session.tools()
    const clientToolSet = createToolsFromClientSchemas(
      input.clientTools as never,
    )
    const tools: ToolSet = {
      ...workspaceTools,
      ...baseTools,
      ...extensionTools,
      ...contextTools,
      ...(self.mcp?.getAITools?.() ?? {}),
      ...clientToolSet,
      ...(input.callerTools ?? {}),
    }

    const system: string =
      (await self.session.freezeSystemPrompt()) || this.getSystemPrompt()
    const messages = pruneMessages({
      messages: await convertToModelMessages(
        // SessionMessage shape passes through convertToModelMessages at
        // runtime exactly as upstream does; .d.ts nominal types disagree.
        truncateOlderMessages(self.session.getHistory()) as never,
      ),
      toolCalls: 'before-last-2-messages',
    })
    if (messages.length === 0)
      throw new Error(
        'No messages to send to the model. This usually means the chat request arrived before any messages were persisted.',
      )

    const model = this.getModel()
    const ctx = {
      system,
      messages,
      tools,
      model,
      continuation: input.continuation,
      body: input.body,
    }
    const subclassConfig = (await this.beforeTurn(ctx as TurnContext)) ?? {}
    const config = await self._pipelineExtensionBeforeTurn(ctx, subclassConfig)

    const finalModel = config.model ?? model
    const finalSystem = config.system ?? system
    const finalMessages = config.messages ?? messages
    const mergedTools: ToolSet = config.tools
      ? { ...tools, ...config.tools }
      : tools
    const finalTools = self._wrapToolsWithDecision(mergedTools)
    const finalMaxSteps = config.maxSteps ?? this.maxSteps

    console.log(
      `[think] _runInferenceLoop override ACTIVE; stopWhen=[stepCountIs(${finalMaxSteps}), hasToolCall('propose'), hasToolCall('reply')] tools=${Object.keys(finalTools).join(',')} continuation=${input.continuation}`,
    )

    // `parallel_tool_calls: false` is passed through verbatim by
    // `@ai-sdk/openai-compatible` via `providerOptions[<providerName>]` —
    // see openai-compatible-chat-language-model.ts spread logic. vLLM ≥ the
    // Nov-2025 PR trims multi-tool responses to a single call per step,
    // which serializes Kimi's propose + reply into two distinct steps and
    // eliminates the client-side tool-result race that drove the observed
    // auto-continuation loop. The provider-name key must match the `name`
    // passed to `createOpenAICompatible` in `nim-provider.ts`.
    const mergedProviderOptions = {
      ...(config.providerOptions ?? {}),
      'cf-ai-gateway-nim': {
        ...(config.providerOptions?.['cf-ai-gateway-nim'] ?? {}),
        parallel_tool_calls: false,
      },
    }

    const result = streamText({
      model: finalModel,
      system: finalSystem,
      messages: finalMessages,
      tools: finalTools,
      activeTools: config.activeTools,
      toolChoice: config.toolChoice,
      // THE ONLY DIVERGENCE FROM UPSTREAM: both `propose` and `reply` are
      // terminal (they carry their own user-facing `message`), so a single
      // call to either ends the turn. See header comment.
      stopWhen: [
        stepCountIs(finalMaxSteps),
        hasToolCall('propose'),
        hasToolCall('reply'),
      ],
      providerOptions: mergedProviderOptions,
      abortSignal: input.signal,
      onChunk: async (event) => {
        await self.onChunk(event)
        await self._pipelineExtensionChunk(event)
      },
      onStepFinish: async (event) => {
        const toolCallNames = (event.toolCalls ?? [])
          .map((tc: { toolName: string }) => tc.toolName)
          .join(',')
        const textLen = typeof event.text === 'string' ? event.text.length : 0
        console.log(
          `[think] stepFinish toolCalls=[${toolCallNames}] textLen=${textLen} finishReason=${event.finishReason}`,
        )
        await self.onStepFinish(event)
        await self._pipelineExtensionStepFinish(event)
      },
      experimental_onToolCallFinish: async (event: any) => {
        const base = {
          ...event.toolCall,
          stepNumber: event.stepNumber,
          messages: event.messages,
          durationMs: event.durationMs,
        }
        const toolCtx = event.success
          ? { ...base, success: true, output: event.output }
          : { ...base, success: false, error: event.error }
        await this.afterToolCall(toolCtx as ToolCallResultContext)
        await self._pipelineExtensionToolCallFinish(event)
      },
    })
    return self._transformInferenceResult(result)
  }

  // ---------------------------------------------------------------------------
  // UPSTREAM PATCH: suppress auto-continuation after terminal tools
  // ---------------------------------------------------------------------------
  //
  // `@cloudflare/ai-chat`'s `sendToolOutputToServer` always sends every
  // client-tool result with `autoContinue: true` (see
  // `node_modules/@cloudflare/ai-chat/dist/react.js:765-779`), and
  // `Think._handleProtocolEvent`'s "tool-result" case unconditionally fires
  // `this._scheduleAutoContinuation(connection)` when that flag is set (see
  // `node_modules/@cloudflare/think/dist/think.js:940-955`). That starts a
  // fresh `_runInferenceLoop({ continuation: true })` 50 ms later.
  //
  // Both `propose` and `reply` are terminal tools — each one carries its
  // own user-facing `message` and ends the turn. Auto-continuing after
  // either would drive the model into a "double-check" loop (observed
  // with Kimi K2: re-calls generate_entry + propose, hits the dedup
  // guard, calls reply, loops until the step budget runs out).
  //
  // PRIMARY DEFENSE IS ELSEWHERE (`parallel_tool_calls: false`)
  // ----------------------------------------------------------
  // This override is now belt-and-suspenders. `parallel_tool_calls: false`
  // (passed via providerOptions on the streamText call) forces vLLM to trim
  // to a single tool call per step, so `propose` / `reply` can't come back
  // alongside another tool in the same step. Combined with
  // `stopWhen: hasToolCall('propose' | 'reply')` on the streamText, the
  // turn ends cleanly at the streamText level. This override catches any
  // (theoretically still-possible) single-step terminal-tool result that
  // arrives with `autoContinue: true` and prevents a fresh loop.
  //
  // UPSTREAM FIX WE'RE WAITING ON
  // -----------------------------
  // Expose a `shouldAutoContinue(event): boolean` hook on `Think` (or pipe a
  // per-tool `terminal: true` flag through to the tool-result branch). Once
  // that ships, delete this override and return `false` for `reply`.
  //
  // MAINTENANCE RISK
  // ----------------
  // This is a full copy of the private `_handleProtocolEvent` switch. Any
  // upstream change to the method (new event types, reshuffled persistence,
  // new auto-continuation semantics) must be reflected here. Re-check against
  // `node_modules/@cloudflare/think/dist/think.js` on every version bump.
  async _handleProtocolEvent(
    connection: unknown,
    event: ChatProtocolEvent,
  ): Promise<void> {
    const isTerminal =
      event.type === 'tool-result' &&
      (event.toolName === 'reply' || event.toolName === 'propose')
    if (!isTerminal) {
      return (Think.prototype as any)._handleProtocolEvent.call(
        this,
        connection,
        event,
      )
    }
    const self = this as any
    if (event.clientTools && event.clientTools.length > 0) {
      self._lastClientTools = event.clientTools
      self._persistClientTools()
    }
    const resultPromise = Promise.resolve().then(() => {
      self._applyToolResult(
        event.toolCallId,
        event.output,
        event.state,
        event.errorText,
      )
      return true
    })
    self._pendingInteractionPromise = resultPromise
    resultPromise
      .finally(() => {
        if (self._pendingInteractionPromise === resultPromise)
          self._pendingInteractionPromise = null
      })
      .catch(() => {})
    console.log(
      `[think] ${(event as { toolName: string }).toolName} is terminal; suppressing auto-continuation (autoContinue=${event.autoContinue})`,
    )
  }
}

function readWriterMaxAttempts(env: Cloudflare.Env): number {
  const raw = env.WRITER_MAX_ATTEMPTS
  if (!raw) return DEFAULT_WRITER_MAX_ATTEMPTS
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_WRITER_MAX_ATTEMPTS
  return Math.min(n, 5)
}
