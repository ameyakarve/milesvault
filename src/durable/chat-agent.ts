import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat'
import { convertToModelMessages, streamText, wrapLanguageModel } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createToolMiddleware } from '@ai-sdk-tool/parser'
import { buildLedgerTools } from '@/lib/chat/ledger-tools'
import { kimiProtocol } from '@/lib/chat/kimi-protocol'

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10)
  return `You are MilesVault's ledger assistant. Help the user search, read,
and edit their beancount ledger using the provided tools.

Today's date is ${today}. When the user gives a partial date (e.g. "19 april",
"last tuesday"), resolve it relative to today and use ${today.slice(0, 4)} as the
default year unless they say otherwise.

Rules:
- Always use tools to read or modify the ledger. Never invent transactions.
- To add/log, edit, or delete transactions, call ledger_apply with
  { creates?, updates?, deletes? }. All items in one call apply atomically
  (all or none). The UI shows the user a single approval card; do not print
  beancount as plain text. After the tool result comes back, acknowledge
  briefly:
    { ok:true, created, updated, deleted } -> one-line confirmation
    { ok:false, rejected:true } -> say "discarded" and ask what to change
    { ok:false, errors } -> summarize errors, offer a fix
    { ok:false, conflicts } -> say someone else edited it; offer to retry
- When the user wants to change a single existing transaction, use updates
  (NOT a delete + create pair) — updates preserve id and are atomic.
- Batch related edits into one ledger_apply call whenever you can (e.g.
  "split this into food + tip" = one update + one create).
- For creates, produce valid beancount: date on the first line (YYYY-MM-DD *
  "payee" "narration"), each posting indented 4 spaces, account paths in
  Title:Case:With:Colons. Amounts align around column 60. Credit cards are
  liabilities: use Liabilities:CC:<Issuer>, not Assets.
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
    console.log('[chat] msgs', JSON.stringify(modelMessages).slice(0, 800))
    console.log('[chat] tools', Object.keys(tools).join(','))

    const result = streamText({
      model: wrappedModel,
      system: buildSystemPrompt(),
      messages: modelMessages,
      tools,
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
