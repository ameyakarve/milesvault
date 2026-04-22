import { Think } from '@cloudflare/think'
import type {
  ToolCallResultContext,
  TurnConfig,
  TurnContext,
} from '@cloudflare/think'
import { createWorkspaceTools } from '@cloudflare/think/tools/workspace'
import { createToolsFromClientSchemas } from 'agents/chat'
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
      userAccounts = await client.listAccounts()
    } catch (e) {
      if (!(e instanceof LedgerBindingError)) {
        console.warn('[think] listAccounts failed', String(e))
      }
    }
    this.accountsForTurn = userAccounts
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

    const result = streamText({
      model: finalModel,
      system: finalSystem,
      messages: finalMessages,
      tools: finalTools,
      activeTools: config.activeTools,
      toolChoice: config.toolChoice,
      // THE ONLY DIVERGENCE FROM UPSTREAM: add hasToolCall('reply') so a
      // single reply call ends the turn. See header comment.
      stopWhen: [stepCountIs(finalMaxSteps), hasToolCall('reply')],
      providerOptions: config.providerOptions,
      abortSignal: input.signal,
      onChunk: async (event) => {
        await self.onChunk(event)
        await self._pipelineExtensionChunk(event)
      },
      onStepFinish: async (event) => {
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
}

function readWriterMaxAttempts(env: Cloudflare.Env): number {
  const raw = env.WRITER_MAX_ATTEMPTS
  if (!raw) return DEFAULT_WRITER_MAX_ATTEMPTS
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_WRITER_MAX_ATTEMPTS
  return Math.min(n, 5)
}
