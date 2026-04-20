import { Think } from '@cloudflare/think'
import type {
  ToolCallContext,
  ToolCallDecision,
  ToolCallResultContext,
} from '@cloudflare/think'
import type { Session } from 'agents/experimental/memory/session'
import { createCompactFunction } from 'agents/experimental/memory/utils'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createToolMiddleware } from '@ai-sdk-tool/parser'
import { generateText, wrapLanguageModel, type LanguageModel, type ToolSet } from 'ai'
import { buildAgenticLedgerTools } from '@/lib/chat/ledger-tools'
import { kimiProtocol } from '@/lib/chat/kimi-protocol'

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10)
  return `You are MilesVault's ledger assistant. You help the user search, read,
and stage edits to their beancount ledger. You speak beancount — all staged
entries must be valid beancount text that the user can save verbatim.

Today is ${today}. Resolve partial dates ("19 april", "last tuesday") relative
to today; default year is ${today.slice(0, 4)}.

# How writing works

You do NOT save anything. Writes are staged into the user's editor buffer via
propose_create / propose_update / propose_delete. After staging, the user
reviews the diff and clicks Save. Never tell the user to edit the ledger
manually — stage the change yourself.

# Workflow

Users refer to transactions by date, payee, amount — never by id. Resolve
ids yourself. Never invent an id.

To update or delete:
  1. ledger_search with a tight query (see the ledger_search tool for grammar
     and examples).
  2. If 0 hits, broaden once (drop or widen the date). Otherwise tell the user
     you can't find it.
  3. If >1 hit, disambiguate by amount/narration/account. Ask if still unclear.
  4. ledger_get(id) for the exact current raw_text.
  5. propose_update(id, new_raw_text) — replace the FULL raw_text — or
     propose_delete(id).

To create:
  1. ledger_search first to find similar existing entries for this payee.
  2. Copy account names, currency, and formatting from those entries exactly
     (credit cards are Liabilities:..., not Assets:...).
  3. propose_create(raw_text).

# Rules

- Never invent ids, accounts, or amounts.
- Keep replies terse. After a propose_* call, reply with a one-line summary
  of what you staged.
- For breakdowns/aggregations ("spend by category"), run a broad search
  (@expenses + date range), then group the results yourself in the reply —
  the tool does not aggregate.`
}

export class ThinkAgent extends Think<Cloudflare.Env> {
  maxSteps = 5

  getModel(): LanguageModel {
    const provider = createOpenAICompatible({
      name: 'cf-ai-gateway-nim',
      baseURL: `https://gateway.ai.cloudflare.com/v1/${this.env.CLOUDFLARE_ACCOUNT_ID}/${this.env.AI_GATEWAY_NAME}/custom-nvidia-nim`,
      headers: {
        'cf-aig-authorization': `Bearer ${this.env.CF_AIG_TOKEN}`,
      },
    })
    const kimiMiddleware = createToolMiddleware({
      protocol: kimiProtocol(),
      toolSystemPromptTemplate: (toolList) =>
        `You have access to the following tools. When you decide to call a tool, emit the call using Kimi's native tool-call tokens only (no python code blocks). Exact format per call:\n<|tool_calls_section_begin|><|tool_call_begin|>functions.<name>:0<|tool_call_argument_begin|>{"arg":"value"}<|tool_call_end|><|tool_calls_section_end|>\n\nAvailable tools:\n${toolList
          .map(
            (t) =>
              `- ${t.name}: ${t.description ?? ''}\n  parameters: ${JSON.stringify(t.inputSchema)}`,
          )
          .join('\n')}`,
      toolResponsePromptTemplate: (toolResult) => {
        const out = toolResult.output
        const body =
          typeof out === 'string'
            ? out
            : JSON.stringify(
                (out as { type?: string; value?: unknown })?.value ?? out,
              )
        return `<|tool_result_begin|>${toolResult.toolName}:${toolResult.toolCallId}<|tool_result_argument_begin|>${body}<|tool_result_end|>`
      },
    })
    return wrapLanguageModel({
      model: provider.chatModel(this.env.CHAT_MODEL),
      middleware: kimiMiddleware,
    })
  }

  getSystemPrompt(): string {
    return buildSystemPrompt()
  }

  getTools(): ToolSet {
    const email = this.name
    if (!email || !email.includes('@')) return {}
    return buildAgenticLedgerTools(this.env, email)
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

  beforeToolCall(ctx: ToolCallContext): ToolCallDecision | void {
    if (ctx.toolName === 'ledger_search') {
      const q = (ctx.input as { q?: unknown })?.q
      if (typeof q === 'string' && q.trim().length === 0) {
        return {
          action: 'block',
          reason:
            'Empty query. Provide at least one filter (date range, @account, or a specific payee/merchant).',
        }
      }
    }
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
