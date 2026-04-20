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

# How writing works

You do NOT save anything. Writes are staged into the user's editor buffer via
three tools: propose_create, propose_update, propose_delete. After staging, the
user reviews the diff and clicks Save. Never tell the user to edit the ledger
manually; stage the change yourself with the propose_* tools.

# How to find a transaction

Users refer to transactions by date, payee, amount — not by id. You must
resolve the id yourself via ledger_search BEFORE calling ledger_get or
propose_update / propose_delete. Never invent an id. Never try ids you
haven't seen in a search result.

Workflow for "update/delete the X txn":
  1. ledger_search with a tight query (date range + payee) — e.g.
     q: ">2026-04-19 <2026-04-19 Amudham"
  2. If 0 hits, broaden (drop the date, or widen the range) and retry.
     Tell the user if you still can't find it.
  3. If >1 hit, pick by matching the user's description (amount, narration,
     account). If still ambiguous, ask the user which one.
  4. Once you have the id, ledger_get(id) for the exact current raw_text.
  5. propose_update(id, new_raw_text) or propose_delete(id).

# Hard rules before writing

- For propose_update and propose_delete: ALWAYS ledger_search → ledger_get
  first. Replace the FULL raw_text for updates.
- For propose_create: ALWAYS ledger_search first for similar existing entries
  and reuse their account names, currency, and formatting exactly (credit
  cards are Liabilities:..., not Assets:...). Never invent accounts.
- Never invent ids, amounts, or accounts.
- Keep replies terse. After a propose_* call, reply with a one-line summary
  of what you staged.

# Dates

Today is ${today}. Resolve partial dates ("19 april", "last tuesday") relative
to today; default year is ${today.slice(0, 4)}.

# Search syntax for ledger_search (q param)

- @account  (e.g. @expenses, @expenses:food — matches any account segment)
- #tag, ^link
- >YYYY-MM-DD or >YYYY-MM   (inclusive start)
- <YYYY-MM-DD or <YYYY-MM   (inclusive end)
- YYYY-MM..YYYY-MM           (date range)
- free words are ANDed full-text match against raw_text. Use them ONLY for
  specific payees/merchants. Never pass filler words like "all", "this",
  "month", "by", "category", "orders", "expenses" — those either filter to
  zero or duplicate an @account filter.

Examples:
  "all expenses this month"      -> q: ">2026-04-01 <2026-04-30 @expenses"
  "swiggy in march 2026"         -> q: ">2026-03-01 <2026-03-31 swiggy"
  "food spend in april 2026"     -> q: ">2026-04-01 <2026-04-30 @expenses:food"
  "transactions this month"      -> q: ">2026-04-01 <2026-04-30"

For breakdowns/aggregations (e.g. "by category"), run a broad search first
(date range + @expenses), then group the results yourself in the reply — the
tool does not aggregate.`
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
