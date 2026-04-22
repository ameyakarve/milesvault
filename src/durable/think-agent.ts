import { Think } from '@cloudflare/think'
import type {
  ToolCallResultContext,
  TurnConfig,
  TurnContext,
} from '@cloudflare/think'
import type { Session } from 'agents/experimental/memory/session'
import { createCompactFunction } from 'agents/experimental/memory/utils'
import { generateText, wrapLanguageModel, type LanguageModel, type ToolSet } from 'ai'
import { kimiRescueMiddleware } from '@/lib/chat/kimi-rescue-middleware'
import { toolDisciplineMiddleware } from '@/lib/chat/tool-discipline-middleware'
import { createNimChatModel } from '@/lib/chat/nim-provider'
import { createLedgerClient, LedgerBindingError } from '@/lib/ledger-api'
import { buildAccountsBlock, buildSystemPrompt } from './think-agent-prompt'
import { buildGenerateEntryTool } from './writer-agent'

const DEFAULT_WRITER_MAX_ATTEMPTS = 3

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
}

function readWriterMaxAttempts(env: Cloudflare.Env): number {
  const raw = env.WRITER_MAX_ATTEMPTS
  if (!raw) return DEFAULT_WRITER_MAX_ATTEMPTS
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_WRITER_MAX_ATTEMPTS
  return Math.min(n, 5)
}
