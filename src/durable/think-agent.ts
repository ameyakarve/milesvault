import { Think } from '@cloudflare/think'
import type {
  ToolCallResultContext,
  TurnConfig,
  TurnContext,
} from '@cloudflare/think'
import type { Session } from 'agents/experimental/memory/session'
import { createCompactFunction } from 'agents/experimental/memory/utils'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, wrapLanguageModel, type LanguageModel } from 'ai'
import { kimiRescueMiddleware } from '@/lib/chat/kimi-rescue-middleware'
import { toolDisciplineMiddleware } from '@/lib/chat/tool-discipline-middleware'
import { withNimRequestNormalize } from '@/lib/chat/nim-request-normalize'
import { createLedgerClient, LedgerBindingError } from '@/lib/ledger-api'
import { buildAccountsBlock, buildSystemPrompt } from './think-agent-prompt'

export class ThinkAgent extends Think<Cloudflare.Env> {
  maxSteps = 10

  getModel(): LanguageModel {
    const provider = createOpenAICompatible({
      name: 'cf-ai-gateway-nim',
      baseURL: `https://gateway.ai.cloudflare.com/v1/${this.env.CLOUDFLARE_ACCOUNT_ID}/${this.env.AI_GATEWAY_NAME}/custom-nvidia-nim`,
      headers: {
        'cf-aig-authorization': `Bearer ${this.env.CF_AIG_TOKEN}`,
      },
      fetch: withNimRequestNormalize(),
    })
    return wrapLanguageModel({
      model: provider.chatModel(this.env.CHAT_MODEL),
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

  getSystemPrompt(): string {
    return buildSystemPrompt()
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
