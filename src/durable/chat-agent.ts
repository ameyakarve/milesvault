import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat'
import { convertToModelMessages, stepCountIs, streamText, wrapLanguageModel } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createToolMiddleware } from '@ai-sdk-tool/parser'
import { buildLedgerTools } from '@/lib/chat/ledger-tools'
import { kimiProtocol } from '@/lib/chat/kimi-protocol'

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10)
  return `You are MilesVault's ledger assistant. Help the user search, read,
and edit their beancount ledger using the provided tools.

# HARD RULE — do not break

If the user asks to add / create / record / log / enter a new transaction,
OR to edit / update / change / delete / remove an existing one, your response
MUST be a ledger_apply tool call. NEVER print beancount as plain text in
the assistant message — the UI renders an approval card from the tool call,
and plain text is NOT shown to the user as an editable card.

You emit a tool call using Kimi's native tokens, like this (literal format):

  <|tool_calls_section_begin|><|tool_call_begin|>functions.ledger_apply:0<|tool_call_argument_begin|>{"creates":[{"raw_text":"2026-04-20 * \\"Supermarket\\" \\"Groceries\\"\\n    Expenses:Food:Groceries      180.00 INR\\n    Income:Cashback              -20.00 INR\\n    Liabilities:CC:HSBC         -160.00 INR"}]}<|tool_call_end|><|tool_calls_section_end|>

No prose before it. No prose after it. Just the token section.

# Dates

Today is ${today}. Resolve partial dates ("19 april", "last tuesday")
relative to today; default year is ${today.slice(0, 4)}.

# Rules

- Always use tools to read or modify the ledger. Never invent transactions,
  ids, amounts, or accounts.
- ledger_apply takes { creates?, updates?, deletes? }. All items apply
  atomically. Outcome handling:
    { ok:true, created, updated, deleted } -> one-line confirmation
    { ok:false, rejected:true }            -> "discarded" + ask what to change
    { ok:false, errors }                   -> summarize errors, offer a fix
    { ok:false, conflicts }                -> say someone else edited it; retry
- To change ONE existing transaction, use updates (NOT delete+create) —
  updates preserve id. Before any update/delete, call ledger_search or
  ledger_get to fetch the real id and raw_text. Never guess ids.
- Batch related edits into one ledger_apply (split = 1 update + 1 create).
- Beancount format: \`YYYY-MM-DD * "payee" "narration"\` on line 1, postings
  indented 4 spaces: \`<Account>  <amount> <CCY>\`. Top-level account MUST be
  one of Assets, Liabilities, Income, Expenses, Equity. Credit cards are
  liabilities: \`Liabilities:CC:<Issuer>\` (HSBC, Axis, HDFC, …). If you do
  not know the issuer, ask the user or look it up — never invent one.
- Postings must sum to zero within each currency.
- Cashback on a CC purchase (user's convention): for a purchase of P with
  cashback C on <Issuer>, use three postings:
    Expenses:<Category>        P.00 INR
    Income:Cashback           -C.00 INR
    Liabilities:CC:<Issuer>  -(P-C).00 INR
  The expense stays at sticker price; the CC is charged only the net.
- Keep replies terse. Show 5-10 rows max unless asked for more.

Search syntax for ledger_search (q param):
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
When the user asks for a breakdown/aggregation (e.g. "by category"), run a
broad search first (date range + @expenses), then group the results yourself
in the reply — the tool does not aggregate.`
}

export class ChatAgent extends AIChatAgent<Cloudflare.Env> {
  maxPersistedMessages = 100

  async onChatMessage(
    _onFinish: unknown,
    options?: OnChatMessageOptions,
  ): Promise<Response | undefined> {
    try {
      return await this._onChatMessage(_onFinish, options)
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ''}` : String(e)
      console.error('[chat] top-level throw', msg)
      throw e
    }
  }

  async _onChatMessage(
    _onFinish: unknown,
    options?: OnChatMessageOptions,
  ): Promise<Response | undefined> {
    const email = this.name
    if (!email || !email.includes('@')) {
      return new Response('ChatAgent instance must be keyed by user email', { status: 400 })
    }

    const provider = createOpenAICompatible({
      name: 'cf-ai-gateway-nim',
      baseURL: `https://gateway.ai.cloudflare.com/v1/${this.env.CLOUDFLARE_ACCOUNT_ID}/${this.env.AI_GATEWAY_NAME}/custom-nvidia-nim`,
      headers: {
        'cf-aig-authorization': `Bearer ${this.env.CF_AIG_TOKEN}`,
      },
    })

    const tools = buildLedgerTools(this.env, email)

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

    const wrappedModel = wrapLanguageModel({
      model: provider.chatModel(this.env.CHAT_MODEL),
      middleware: kimiMiddleware,
    })

    const modelMessages = await convertToModelMessages(this.messages)
    console.log('[chat] msgs-count', modelMessages.length)
    for (let i = 0; i < modelMessages.length; i++) {
      const m = modelMessages[i]
      console.log(`[chat] msg[${i}] role=${m.role}`, JSON.stringify(m.content).slice(0, 500))
    }
    console.log('[chat] tools', Object.keys(tools).join(','))

    const result = streamText({
      model: wrappedModel,
      system: buildSystemPrompt(),
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(10),
      abortSignal: options?.abortSignal,
      onError: (e) => {
        console.error('[chat] streamText onError', e)
      },
    })

    return result.toUIMessageStreamResponse({
      onError: (e) => {
        const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
        console.error('[chat] toUIMessageStreamResponse onError', msg)
        return msg
      },
    })
  }
}
