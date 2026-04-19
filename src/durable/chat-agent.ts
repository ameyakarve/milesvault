import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat'
import { convertToModelMessages, streamText } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { buildLedgerTools } from '@/lib/chat/ledger-tools'

const SYSTEM_PROMPT = `You are MilesVault's ledger assistant. Help the user search, read,
and edit their beancount ledger using the provided tools.

Rules:
- Always use tools to read or modify the ledger. Never invent transactions.
- For creates, produce valid beancount: date on the first line (YYYY-MM-DD flag
  "payee" "narration"), each posting indented 4 spaces, account paths in
  Title:Case:With:Colons. Amounts align around column 60.
- Confirm destructive edits (ledger_remove) with the user before calling the tool.
- Keep replies terse. Show 5-10 rows max unless asked for more.`

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

    const tools = await buildLedgerTools(email)

    const result = streamText({
      model: provider.chatModel(this.env.CHAT_MODEL),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(this.messages),
      tools,
      abortSignal: options?.abortSignal,
    })

    return result.toUIMessageStreamResponse()
  }
}
