import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat'
import { convertToModelMessages, streamText } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { buildLedgerTools } from '@/lib/chat/ledger-tools'

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10)
  return `You are MilesVault's ledger assistant. Help the user search, read,
and edit their beancount ledger using the provided tools.

Today's date is ${today}. When the user gives a partial date (e.g. "19 april",
"last tuesday"), resolve it relative to today and use ${today.slice(0, 4)} as the
default year unless they say otherwise.

Rules:
- Always use tools to read or modify the ledger. Never invent transactions.
- If the user asks to create, add, or log a transaction, CALL ledger_create
  immediately with a raw_text argument. Do not print the beancount block as
  plain text — the user cannot save it that way. After the tool returns, show
  a brief confirmation (id + one-line summary).
- For creates, produce valid beancount: date on the first line (YYYY-MM-DD *
  "payee" "narration"), each posting indented 4 spaces, account paths in
  Title:Case:With:Colons. Amounts align around column 60. Credit cards are
  liabilities: use Liabilities:CC:<Issuer>, not Assets.
- Confirm destructive edits (ledger_remove) with the user before calling the tool.
- Keep replies terse. Show 5-10 rows max unless asked for more.

Search syntax for ledger_search (q param):
- @account  (e.g. @expenses:food — matches any account segment)
- #tag, ^link
- >YYYY-MM-DD or >YYYY-MM   (inclusive start)
- <YYYY-MM-DD or <YYYY-MM   (inclusive end)
- YYYY-MM..YYYY-MM           (date range)
- free words match payee/narration/raw_text
Examples: "april 2026 orders" -> q: ">2026-04-01 <2026-04-30 order"
          "swiggy in march"   -> q: ">2026-03-01 <2026-03-31 swiggy"`
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

    const result = streamText({
      model: provider.chatModel(this.env.CHAT_MODEL),
      system: buildSystemPrompt(),
      messages: await convertToModelMessages(this.messages),
      tools,
      abortSignal: options?.abortSignal,
    })

    return result.toUIMessageStreamResponse()
  }
}
