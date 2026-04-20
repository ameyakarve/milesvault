import { Think } from '@cloudflare/think'
import type {
  ToolCallContext,
  ToolCallDecision,
  ToolCallResultContext,
  TurnConfig,
  TurnContext,
} from '@cloudflare/think'
import type { Session } from 'agents/experimental/memory/session'
import { createCompactFunction } from 'agents/experimental/memory/utils'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createToolMiddleware } from '@ai-sdk-tool/parser'
import { generateText, wrapLanguageModel, type LanguageModel, type ToolSet } from 'ai'
import { buildAgenticLedgerTools } from '@/lib/chat/ledger-tools'
import { kimiProtocol } from '@/lib/chat/kimi-protocol'
import { createLedgerClient, LedgerBindingError } from '@/lib/ledger-api'
import { ALL_ACCOUNTS } from '@/lib/beancount/accounts'

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

Each ledger_search / ledger_get result includes an \`editable\` flag and
\`source\` ('client' | 'server'):
  - editable: true  → the entry is in the user's current editor viewport
                      (or is an unsaved new entry); you may propose_update /
                      propose_delete it directly.
  - editable: false → the entry is on the server but not currently loaded.
                      \`reason\` tells you why. Do NOT propose_update /
                      propose_delete it. Instead, relay \`reason\` to the
                      user and wait:
                        * "unsaved buffer changes" → ask the user to save,
                          then retry.
                        * "out of viewport" → ask the user to widen the
                          editor filter (or scroll to the right page),
                          then retry.

To update or delete:
  1. ledger_search with a tight query (see the ledger_search tool for grammar
     and examples).
  2. If 0 hits, broaden once (drop or widen the date). Otherwise tell the user
     you can't find it.
  3. If >1 hit, disambiguate by amount/narration/account. Ask if still unclear.
  4. If the hit has editable=true → propose_update(id, new_raw_text) with the
     FULL replacement raw_text (or propose_delete(id)).
  5. If editable=false → relay the reason; don't stage.

To create:
  1. ledger_search first to find similar existing entries for this payee.
  2. Copy account names, currency, and formatting from those entries exactly
     (credit cards are Liabilities:..., not Assets:...).
  3. propose_create(raw_text).

# Rules

- Never invent ids, accounts, or amounts.
- Never call propose_update / propose_delete on rows with editable=false.
- Keep replies terse. After a propose_* call, reply with a one-line summary
  of what you staged.
- For breakdowns/aggregations ("spend by category"), run a broad search
  (@expenses + date range), then group the results yourself in the reply —
  the tool does not aggregate.`
}

function buildAccountsBlock(userAccounts: readonly string[]): string {
  const userList =
    userAccounts.length > 0 ? userAccounts.join('\n') : '(no transactions yet)'
  const predefinedList = ALL_ACCOUNTS.join('\n')
  return `# Accounts

The user's ledger currently contains these accounts (full beancount names).
When updating/creating, use one of these verbatim — match spelling and case.
Credit cards live under Liabilities:CC:..., not Assets.

${userList}

The app's predefined category taxonomy (authoritative for NEW accounts when
the user doesn't have a fitting one yet; prefer an existing user account when
possible):

${predefinedList}`
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
