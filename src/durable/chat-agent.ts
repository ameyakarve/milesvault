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
- To add/log a transaction, call ledger_create with a raw_text argument. The
  UI will show the user an approval card; do not print beancount as plain
  text. After the tool result comes back, acknowledge briefly:
    { ok:true, transaction } -> one-line confirmation with the id
    { ok:false, rejected:true } -> say "discarded" and ask what to change
    { ok:false, errors } -> summarize errors, offer a fix
- To delete, call ledger_remove with the id. Same approval flow applies.
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
    })

    const wrappedModel = wrapLanguageModel({
      model: provider.chatModel(this.env.CHAT_MODEL),
      middleware: kimiMiddleware,
    })

    const result = streamText({
      model: wrappedModel,
      system: buildSystemPrompt(),
      messages: await convertToModelMessages(this.messages),
      tools,
      abortSignal: options?.abortSignal,
    })

    return result.toUIMessageStreamResponse()
  }
}
